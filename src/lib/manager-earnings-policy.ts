// Manager earnings policy — the financial core of the Manager module (plan §5).
//
// Invariants implemented here:
// 1. One earning per successful organization payment (unique `eventKey`).
// 2. The assignment + rule in force at payment time are snapshotted on the
//    earning, so later reassignment or rule changes never rewrite history.
// 3. Refunds create SEPARATE signed reversal entries — originals are never
//    mutated or deleted — and cumulative reversals can never exceed the
//    original earning.
// 4. Available balance excludes anything already allocated to a
//    requested/processing payout (no double allocation).

import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import {
  calculateEarningAmount,
  earningEventKey,
  maturityDate,
  reversalEventKey,
} from "@/lib/manager-constants";
import type { ManagerEarning, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Resolve the active revenue-share rule for a scope at a point in time. */
export async function resolveActiveRule(
  tx: Tx,
  managerId: string,
  organizationType: string,
  transactionType: string,
  at: Date
) {
  const rules = await tx.managerRevenueShareRule.findMany({
    where: {
      managerId,
      organizationType,
      transactionType,
      status: "active",
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
    take: 2, // take two so overlapping rows can be detected, not silently picked
  });

  if (rules.length === 0) return null;
  if (rules.length > 1) {
    // Overlaps are rejected at rule-creation time; refuse to guess here.
    throw new Error(
      `Overlapping active revenue share rules for ${managerId}/${organizationType}/${transactionType}`
    );
  }
  return rules[0];
}

/** Resolve the assignment that was in force for an organization at a moment. */
export async function resolveAssignmentInForce(
  tx: Tx,
  organizationType: "pharmacy" | "laboratory",
  organizationId: string,
  at: Date
) {
  // NOTE: no relationshipStatus filter here — the TIME WINDOW is the source of
  // truth. A row whose relationshipStatus is now "ended" may still have been
  // the assignment in force when an older payment occurred (reassignment
  // history must keep crediting historical payments correctly).
  return tx.managerAssignment.findFirst({
    where: {
      organizationType,
      ...(organizationType === "pharmacy" ? { pharmacyId: organizationId } : { laboratoryId: organizationId }),
      startsAt: { lte: at },
      OR: [{ endsAt: null }, { endsAt: { gt: at } }],
    },
    orderBy: { startsAt: "desc" },
  });
}

/**
 * Create the Manager Earning for a successful organization payment.
 * Idempotent: re-confirming the same payment returns the existing earning
 * instead of duplicating it (keyed on the payment's unique eventKey).
 * Returns null when no rule is active — the payment stays successful but
 * does not invent an earning (plan §5 algorithm step 4).
 */
export async function createEarningForPayment(
  paymentId: string,
  tx?: Tx
): Promise<ManagerEarning | null | "already_processed"> {
  const run = async (client: Tx) => {
    const payment = await client.organizationPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error(`Organization payment ${paymentId} not found`);

    // Step 1 — idempotency: already processed?
    const existing = await client.managerEarning.findUnique({
      where: { eventKey: earningEventKey(payment.id) },
    });
    if (existing) return "already_processed" as const;

    if (payment.status !== "successful") {
      throw new Error(`Payment ${payment.id} is not successful; refusing to create an earning`);
    }
    const paidAt = payment.paidAt ?? payment.createdAt;

    // Step 2 — assignment in force at payment time (historical truth).
    const assignment = await resolveAssignmentInForce(
      client,
      payment.organizationType as "pharmacy" | "laboratory",
      payment.organizationType === "pharmacy" ? payment.pharmacyId! : payment.laboratoryId!,
      paidAt
    );
    if (!assignment) return null; // nobody manages this org at payment time

    // Step 3 — exactly one active rule for this scope.
    const rule = await resolveActiveRule(
      client,
      assignment.managerId,
      payment.organizationType,
      payment.transactionType,
      paidAt
    );
    if (!rule) return null; // payment recorded, no earning invented

    // Step 5 — calculate once, round once.
    const amount = calculateEarningAmount(payment.amount, rule.rateBps);

    // Step 6 — immutable ledger entry with snapshots (plan §3.5).
    const organizationName =
      payment.organizationType === "pharmacy"
        ? (await client.pharmacy.findUnique({ where: { id: payment.pharmacyId! } }))?.name
        : (await client.laboratory.findUnique({ where: { id: payment.laboratoryId! } }))?.name;

    const count = await client.managerEarning.count();
    const earning = await client.managerEarning.create({
      data: {
        id: genId("MGE"),
        earningNumber: `MGE-${String(count + 1).padStart(5, "0")}`,
        eventKey: earningEventKey(payment.id),
        managerId: assignment.managerId,
        managerAssignmentId: assignment.id,
        organizationPaymentId: payment.id,
        organizationType: payment.organizationType,
        organizationId: payment.organizationType === "pharmacy" ? payment.pharmacyId! : payment.laboratoryId!,
        organizationName: organizationName ?? "Unknown organization",
        paymentType: payment.transactionType,
        paymentNumber: payment.paymentNumber,
        eligibleAmount: payment.amount,
        rateBps: rule.rateBps,
        amount,
        entryType: "earning",
        status: "pending",
        occurredAt: paidAt,
      },
    });

    // Step 7 — audit + notification inside the same transaction (step 8).
    await client.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: "SYSTEM",
        actorRole: "system",
        action: "manager_earning_created",
        entityType: "manager_earning",
        entityId: earning.id,
        description: `Earning ${earning.earningNumber} created from payment ${payment.paymentNumber} (${earning.organizationName}).`,
      },
    });
    await client.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: earning.managerId,
        recipientType: "manager",
        title: "New Manager Earning",
        body: `${earning.organizationName} ${payment.transactionType.replace("_", " ")} payment generated ₦${amount.toLocaleString("en-NG")}.`,
        type: "manager",
        relatedId: earning.id,
        read: false,
      },
    });

    return earning;
  };

  return tx ? run(tx) : db.$transaction(run);
}

/**
 * Create a signed reversal entry for a (partial or full) refund of an
 * organization payment. Multiple partial refunds are supported via numbered
 * event keys. Cumulative reversals are clamped so they never exceed the
 * original earning. Fully reversed originals flip to status "reversed";
 * partial reversals keep the original status so the pair still nets out.
 */
export async function createReversalForRefund(paymentId: string, tx?: Tx) {
  const run = async (client: Tx) => {
    const payment = await client.organizationPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error(`Organization payment ${paymentId} not found`);
    if (payment.status !== "refunded") {
      throw new Error(`Payment ${payment.id} is not refunded; refusing to create a reversal`);
    }

    const original = await client.managerEarning.findUnique({
      where: { eventKey: earningEventKey(payment.id) },
    });
    // No earning existed for this payment (e.g. no rule at the time) — nothing to reverse.
    if (!original) return null;

    const priorReversals = await client.managerEarning.aggregate({
      where: { reversalOfId: original.id, entryType: "reversal" },
      _sum: { amount: true },
    });
    const alreadyReversed = Math.abs(priorReversals._sum.amount ?? 0);

    // Clamp: cumulative reversals may never exceed the original earning.
    const refundable = Math.max(original.amount - alreadyReversed, 0);
    if (refundable === 0) return null;

    const earnedTotal = calculateEarningAmount(payment.amount, original.rateBps);
    const refundedRatio = payment.refundAmount > 0 ? Math.min(payment.refundAmount / payment.amount, 1) : 1;
    const target = Math.min(calculateEarningAmount(earnedTotal, Math.round(refundedRatio * 10_000)), refundable);
    const amount = -target;

    const sequence =
      (await client.managerEarning.count({ where: { reversalOfId: original.id, entryType: "reversal" } })) + 1;

    const reversal = await client.managerEarning.create({
      data: {
        id: genId("MGE"),
        earningNumber: `MGE-R${String(sequence).padStart(4, "0")}-${original.earningNumber.slice(-3)}`,
        eventKey: reversalEventKey(payment.id, sequence),
        managerId: original.managerId,
        managerAssignmentId: original.managerAssignmentId,
        organizationPaymentId: payment.id,
        organizationType: original.organizationType,
        organizationId: original.organizationId,
        organizationName: original.organizationName,
        paymentType: original.paymentType,
        paymentNumber: original.paymentNumber,
        eligibleAmount: -original.eligibleAmount,
        rateBps: original.rateBps,
        amount,
        entryType: "reversal",
        status: "available",
        occurredAt: payment.refundedAt ?? new Date(),
        reversalOfId: original.id,
      },
    });

    // A fully reversed original is marked so it can never be paid out.
    if (alreadyReversed + target >= original.amount) {
      await client.managerEarning.update({
        where: { id: original.id },
        data: { status: "reversed" },
      });
    }

    await client.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: "SYSTEM",
        actorRole: "system",
        action: "manager_earning_reversed",
        entityType: "manager_earning",
        entityId: reversal.id,
        description: `Reversal for earning ${original.earningNumber} after refund of ${payment.paymentNumber} (₦${Math.abs(amount).toLocaleString("en-NG")}).`,
      },
    });

    return reversal;
  };

  return tx ? run(tx) : db.$transaction(run);
}

/**
 * Available payout balance: every positive/negative ledger entry that is
 * available/never allocated to a live (requested/processing) payout.
 * Entries already allocated to a payout are excluded regardless of their
 * status so a manager cannot request the same money twice (plan §3.6).
 */
export async function calculateAvailableBalance(managerId: string, tx?: Tx) {
  const client = tx ?? db;
  const agg = await client.managerEarning.aggregate({
    where: {
      managerId,
      status: { in: ["available", "paid"] },
      payoutRequestId: null,
    },
    _sum: { amount: true },
  });
  return Math.max(agg._sum.amount ?? 0, 0);
}

/**
 * FIFO whole-entry allocation for a payout request. Earnings are allocated
 * in occurrence order, but only whole entries that still fit under the
 * requested amount — the allocated total can therefore end up slightly
 * BELOW the request (the caller records the allocated total as the payout
 * amount). Returns [] when not a single entry fits (caller must reject).
 */
export async function selectEarningsForPayout(managerId: string, requestedAmount: number, tx?: Tx) {
  const client = tx ?? db;
  const entries = await client.managerEarning.findMany({
    where: { managerId, status: { in: ["available", "paid"] }, payoutRequestId: null, amount: { gt: 0 } },
    orderBy: { occurredAt: "asc" },
  });

  const selected: ManagerEarning[] = [];
  let running = 0;
  for (const entry of entries) {
    if (running + entry.amount > requestedAmount) continue;
    selected.push(entry);
    running += entry.amount;
  }
  if (selected.length === 0) return []; // nothing allocatable
  return selected;
}
