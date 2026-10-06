import type { PrescriptionStatus } from "@royal-palace/contracts";

const ALLOWED_TRANSITIONS: Readonly<Record<PrescriptionStatus, readonly PrescriptionStatus[]>> = {
  DRAFT: ["SIGNED", "CANCELLED"],
  SIGNED: ["SENT", "CANCELLED", "EXPIRED"],
  SENT: ["ACCEPTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["PARTIALLY_DISPENSED", "DISPENSED", "CANCELLED", "EXPIRED"],
  PARTIALLY_DISPENSED: ["PARTIALLY_DISPENSED", "DISPENSED", "CANCELLED", "EXPIRED"],
  DISPENSED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionPrescription(
  from: PrescriptionStatus,
  to: PrescriptionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isPrescriptionTerminal(status: PrescriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
