// POST /api/actions/refund-organization-payment
// Admin records a (full or partial) refund of an organization payment and
// the matching signed reversal entry is created in the SAME transaction
// (plan §3.5 / §5). Historical earning entries are never mutated.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
import { createReversalForRefund } from "@/lib/manager-earnings-policy";

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const body = await req.json();
    const { paymentId, refundAmount, reason } = body ?? {};

    if (!paymentId) return NextResponse.json({ error: "paymentId is required." }, { status: 400 });
    const payment = await db.organizationPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    if (payment.status !== "successful") {
      return NextResponse.json({ error: `Only successful payments can be refunded (current: ${payment.status}).` }, { status: 400 });
    }

    const amount = Number(refundAmount ?? payment.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > payment.amount) {
      return NextResponse.json({ error: `refundAmount must be a whole-naira integer between 1 and ${payment.amount}.` }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await tx.organizationPayment.update({
        where: { id: payment.id },
        data: { status: "refunded", refundedAt: new Date(), refundAmount: amount },
      });

      // Creates the clamped, numbered reversal entry (no-op when there was
      // never an earning for this payment).
      const reversal = await createReversalForRefund(payment.id, tx);
      return { reversal: reversal ?? null };
    });

    await db.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: admin.profileId ?? admin.userId,
        actorRole: "admin",
        action: "organization_payment_refunded",
        entityType: "organization_payment",
        entityId: payment.id,
        description: `Organization payment ${payment.paymentNumber} refunded ₦${amount.toLocaleString("en-NG")}${reason ? ` — ${reason}` : ""}.`,
      },
    });

    // Let the manager know a reversal touched their ledger.
    if (result.reversal) {
      await db.notification.create({
        data: {
          id: genId("NTF"),
          recipientId: result.reversal.managerId,
          recipientType: "manager",
          title: "Manager Earning reversed",
          body: `A refund of ${payment.paymentNumber} reversed ₦${Math.abs(result.reversal.amount).toLocaleString("en-NG")} from your earnings.`,
          type: "manager",
          relatedId: result.reversal.id,
          read: false,
        },
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[refund-organization-payment]", error);
    return NextResponse.json({ error: "Failed to refund payment." }, { status: 500 });
  }
}
