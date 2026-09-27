// POST /api/actions/confirm-organization-payment
// Records an organization-to-Royal-Palace payment and creates the matching
// Manager Earning in ONE transaction (plan §5 algorithm).
// Admin-only on purpose: managers must never be able to record payments
// that generate their own earnings. Idempotent on the unique `reference` —
// replaying the same confirmation never duplicates a payment or earning.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
import { ELIGIBLE_TRANSACTION_TYPES, earningEventKey } from "@/lib/manager-constants";
import { createEarningForPayment } from "@/lib/manager-earnings-policy";

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const body = await req.json();
    const { organizationType, pharmacyId, laboratoryId, transactionType, amount, reference, method, paidAt } = body ?? {};

    if (organizationType !== "pharmacy" && organizationType !== "laboratory") {
      return NextResponse.json({ error: "organizationType must be pharmacy or laboratory." }, { status: 400 });
    }
    if (organizationType === "pharmacy" && !pharmacyId) {
      return NextResponse.json({ error: "pharmacyId is required." }, { status: 400 });
    }
    if (organizationType === "laboratory" && !laboratoryId) {
      return NextResponse.json({ error: "laboratoryId is required." }, { status: 400 });
    }
    if (!ELIGIBLE_TRANSACTION_TYPES.includes(transactionType)) {
      return NextResponse.json({ error: `transactionType must be one of ${ELIGIBLE_TRANSACTION_TYPES.join(", ")}.` }, { status: 400 });
    }
    if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: "amount must be a positive whole-naira integer." }, { status: 400 });
    }
    if (!reference?.trim()) {
      return NextResponse.json({ error: "A unique payment reference is required." }, { status: 400 });
    }

    // Idempotency short-circuit: this reference has already been processed.
    const existing = await db.organizationPayment.findUnique({ where: { reference: reference.trim() } });
    if (existing) {
      const existingEarning = await db.managerEarning.findUnique({
        where: { eventKey: earningEventKey(existing.id) },
      });
      return NextResponse.json({ data: { payment: existing, earning: existingEarning, replay: true } });
    }

    const result = await db.$transaction(async (tx) => {
      const count = await tx.organizationPayment.count();
      const payment = await tx.organizationPayment.create({
        data: {
          id: genId("ORGP"),
          paymentNumber: `ORGP-${1000 + count + 1}`,
          organizationType,
          pharmacyId: organizationType === "pharmacy" ? pharmacyId : null,
          laboratoryId: organizationType === "laboratory" ? laboratoryId : null,
          transactionType,
          amount: Number(amount),
          method: method ?? "bank_transfer",
          status: "successful",
          reference: reference.trim(),
          paidAt: paidAt ? new Date(paidAt) : new Date(),
        },
      });

      // The earning engine is idempotent and snapshots assignment/rule.
      const earning = await createEarningForPayment(payment.id, tx);
      return { payment, earning: earning ?? null };
    });

    await db.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: admin.profileId ?? admin.userId,
        actorRole: "admin",
        action: "organization_payment_confirmed",
        entityType: "organization_payment",
        entityId: result.payment.id,
        description: `Organization payment ${result.payment.paymentNumber} confirmed (₦${Number(amount).toLocaleString("en-NG")} ${transactionType}).`,
      },
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[confirm-organization-payment]", error);
    return NextResponse.json({ error: "Failed to confirm payment." }, { status: 500 });
  }
}
