import type { PaymentStatus } from "@royal-palace/contracts";

import type { VerifiedPaymentEvent } from "./scheduling-payment.types.js";

const EVENT_TARGET: Readonly<Record<VerifiedPaymentEvent["eventType"], PaymentStatus>> = {
  CANCELLED: "CANCELLED",
  DISPUTED: "DISPUTED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  PENDING: "PENDING",
  REFUNDED: "REFUNDED",
  REVERSED: "REVERSED",
  SUCCEEDED: "SUCCEEDED",
};

const PRECEDENCE: Readonly<Record<PaymentStatus, number>> = {
  CREATED: 0,
  PENDING: 1,
  FAILED: 2,
  EXPIRED: 2,
  CANCELLED: 2,
  SUCCEEDED: 3,
  PARTIALLY_REFUNDED: 4,
  DISPUTED: 5,
  REVERSED: 5,
  REFUNDED: 5,
};

/**
 * Provider events may arrive late or out of order. Precedence prevents an older or less
 * authoritative state from reopening a settled/terminal payment, while still allowing a
 * delayed success to supersede an earlier pending failure.
 */
export function resolvePaymentTransition(
  current: PaymentStatus,
  eventType: VerifiedPaymentEvent["eventType"],
): { apply: boolean; target: PaymentStatus } {
  const target = EVENT_TARGET[eventType];
  if (target === "PARTIALLY_REFUNDED" && current === "PARTIALLY_REFUNDED") {
    return { apply: true, target };
  }
  if (target === current) return { apply: false, target };
  if (
    ["FAILED", "EXPIRED", "CANCELLED"].includes(current) &&
    ["FAILED", "EXPIRED", "CANCELLED"].includes(target)
  ) {
    return { apply: target === "EXPIRED" || target === "CANCELLED", target };
  }
  if (current === "DISPUTED" && ["REFUNDED", "REVERSED"].includes(target)) {
    return { apply: true, target };
  }
  return { apply: PRECEDENCE[target] > PRECEDENCE[current], target };
}

export function isFinanciallySettled(status: PaymentStatus): boolean {
  return ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "REVERSED", "DISPUTED"].includes(status);
}
