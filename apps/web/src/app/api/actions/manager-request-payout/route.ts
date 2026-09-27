// POST /api/actions/manager-request-payout
// Manager requests a payout of available earnings (plan §3.6).
// Inside one transaction: re-validate the requested amount against the
// available balance, FIFO-allocate whole ledger entries, link them to the
// payout. Zero/negative/over-balance/duplicate-while-pending requests are
// rejected. The allocated total (which can be slightly below the request,
// whole entries only) is recorded as the payout amount.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { calculateAvailableBalance, selectEarningsForPayout } from "@/lib/manager-earnings-policy";

export async function POST(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const body = await req.json();
    const { amountRequested, notes } = body ?? {};

    const amount = Number(amountRequested);
    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive whole-naira integer." }, { status: 400 });
    }

    // A verified payout account is required before any withdrawal.
    const bankAccount = await db.managerBankAccount.findUnique({ where: { managerId: manager.id } });
    if (!bankAccount || bankAccount.verificationStatus !== "verified") {
      return NextResponse.json({ error: "A verified payout account is required before requesting a payout." }, { status: 400 });
    }

    // One live payout at a time keeps balance accounting obvious.
    const pendingPayout = await db.payoutRequest.findFirst({
      where: { entityType: "manager", managerId: manager.id, status: { in: ["requested", "processing"] } },
    });
    if (pendingPayout) {
      return NextResponse.json(
        { error: `Payout ${pendingPayout.payoutNumber} is already ${pendingPayout.status}. Wait for it to be processed.` },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const available = await calculateAvailableBalance(manager.id, tx);
      if (amount > available) {
        throw Object.assign(new Error(`Requested amount exceeds your available balance (₦${available.toLocaleString("en-NG")}).`), { status: 400 });
      }

      const allocated = await selectEarningsForPayout(manager.id, amount, tx);
      if (allocated.length === 0) {
        throw Object.assign(new Error("No single ledger entry fits the requested amount."), { status: 400 });
      }
      const allocatedTotal = allocated.reduce((sum, e) => sum + e.amount, 0);

      const count = await tx.payoutRequest.count({ where: { entityType: "manager" } });
      const payout = await tx.payoutRequest.create({
        data: {
          id: genId("PAYR"),
          payoutNumber: `RPH-PAYR-M${String(count + 1).padStart(3, "0")}`,
          entityType: "manager",
          entityId: manager.id,
          managerId: manager.id,
          entityName: `${manager.firstName} ${manager.lastName}`,
          amountRequested: allocatedTotal,
          periodStart: allocated[0].occurredAt.toISOString().slice(0, 10),
          periodEnd: new Date().toISOString().slice(0, 10),
          status: "requested",
          method: "bank_transfer",
          notes: notes?.trim() || null,
        },
      });

      // Reserve the allocated entries — payoutRequestId excludes them from
      // any further balance/allocation while this payout is live.
      await tx.managerEarning.updateMany({
        where: { id: { in: allocated.map((e) => e.id) } },
        data: { payoutRequestId: payout.id },
      });

      return { payout, allocatedTotal, entries: allocated.length };
    });

    const typedResult = result as { payout: { id: string; payoutNumber: string }; allocatedTotal: number; entries: number };

    await db.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: manager.id,
        actorRole: "manager",
        action: "manager_requested_payout",
        entityType: "payout_request",
        entityId: typedResult.payout.id,
        description: `Manager requested a payout of ₦${typedResult.allocatedTotal.toLocaleString("en-NG")} (${typedResult.entries} ledger entries).`,
      },
    });
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: "ADM-001",
        recipientType: "admin",
        title: "Manager payout request",
        body: `${manager.firstName} ${manager.lastName} requested a payout of ₦${typedResult.allocatedTotal.toLocaleString("en-NG")}.`,
        type: "system",
        relatedId: typedResult.payout.id,
        read: false,
      },
    });
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: manager.id,
        recipientType: "manager",
        title: "Payout requested",
        body: `Payout ${typedResult.payout.payoutNumber} for ₦${typedResult.allocatedTotal.toLocaleString("en-NG")} is awaiting admin review.`,
        type: "manager",
        relatedId: typedResult.payout.id,
        read: false,
      },
    });

    return NextResponse.json({ data: typedResult.payout }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error && typeof error === "object" && "status" in error) {
      const typed = error as { status: number; message?: string };
      return NextResponse.json({ error: typed.message ?? "Payout request rejected." }, { status: typed.status });
    }
    console.error("[manager-request-payout]", error);
    return NextResponse.json({ error: "Failed to request payout." }, { status: 500 });
  }
}
