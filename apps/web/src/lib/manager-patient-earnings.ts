// Patient-attribution earnings policy.
//
// Managers earn only when a patient acquired through their onboarding link
// completes an eligible paid activity. The source amount and patient identity
// remain server/admin data and are never returned by Manager APIs.

import type { Prisma } from "@prisma/client";
import { genId } from "@/lib/format";

type Tx = Prisma.TransactionClient;

export type PatientActivityType = "consultation" | "pharmacy" | "laboratory" | "hospital";

export interface RecordPatientActivityInput {
  patientId: string;
  activityType: PatientActivityType;
  sourceId: string;
  amount: number;
  reference: string;
  occurredAt?: Date;
}

export function calculateManagerEarning(amount: number, rateBps: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Activity amount must be a positive integer.");
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new Error("Revenue-share rate is invalid.");
  return Math.round((amount * rateBps) / 10_000);
}

export async function recordPatientActivityPayment(input: RecordPatientActivityInput, tx: Tx) {
  const occurredAt = input.occurredAt ?? new Date();
  const existing = await tx.patientActivityPayment.findUnique({ where: { reference: input.reference } });
  if (existing) {
    const earning = await tx.managerEarning.findUnique({ where: { eventKey: `patient-activity:${existing.id}` } });
    return { payment: existing, earning, replay: true };
  }

  const patient = await tx.patient.findUnique({
    where: { id: input.patientId },
    select: { acquiredByManagerId: true, onboardingStatus: true },
  });
  if (!patient) throw new Error("Patient not found.");

  const payment = await tx.patientActivityPayment.create({
    data: {
      id: genId("PAP"),
      paymentNumber: genId("RPH-PAP"),
      patientId: input.patientId,
      activityType: input.activityType,
      sourceId: input.sourceId,
      amount: input.amount,
      reference: input.reference,
      status: "successful",
      occurredAt,
    },
  });

  // Direct signups or patients still awaiting admin approval do not generate
  // Manager Earnings.
  if (!patient.acquiredByManagerId || patient.onboardingStatus !== "approved") {
    return { payment, earning: null, replay: false };
  }

  const rule = await tx.managerRevenueShareRule.findFirst({
    where: {
      managerId: patient.acquiredByManagerId,
      activityType: input.activityType,
      status: "active",
      effectiveFrom: { lte: occurredAt },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: occurredAt } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rule) return { payment, earning: null, replay: false };

  const amount = calculateManagerEarning(input.amount, rule.rateBps);
  if (amount <= 0) return { payment, earning: null, replay: false };

  const earning = await tx.managerEarning.create({
    data: {
      id: genId("ME"),
      earningNumber: genId("RPH-ME"),
      eventKey: `patient-activity:${payment.id}`,
      managerId: patient.acquiredByManagerId,
      patientActivityPaymentId: payment.id,
      organizationType: input.activityType,
      organizationId: input.sourceId,
      organizationName: "Patient activity",
      paymentType: "patient_payment",
      paymentNumber: payment.paymentNumber,
      eligibleAmount: input.amount,
      rateBps: rule.rateBps,
      amount,
      entryType: "earning",
      status: "available",
      occurredAt,
      availableAt: occurredAt,
    },
  });

  return { payment, earning, replay: false };
}
