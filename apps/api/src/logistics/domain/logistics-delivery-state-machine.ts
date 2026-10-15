import type { LogisticsDeliveryStatus } from "@royal-palace/contracts";

const TRANSITIONS: Readonly<Record<LogisticsDeliveryStatus, readonly LogisticsDeliveryStatus[]>> = {
  ASSIGNED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["HEADING_TO_PICKUP", "CANCELLED"],
  HEADING_TO_PICKUP: ["ARRIVED_AT_PICKUP", "FAILED", "CANCELLED"],
  ARRIVED_AT_PICKUP: ["PICKUP_VERIFIED", "FAILED", "CANCELLED"],
  PICKUP_VERIFIED: ["PICKED_UP", "FAILED"],
  PICKED_UP: ["IN_TRANSIT", "FAILED", "RETURNED"],
  IN_TRANSIT: ["ARRIVED_AT_DESTINATION", "FAILED", "RETURNED"],
  ARRIVED_AT_DESTINATION: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: [],
  FAILED: [],
  RETURNED: [],
  CANCELLED: [],
};

export function canTransitionLogisticsDelivery(
  from: LogisticsDeliveryStatus,
  to: LogisticsDeliveryStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isLogisticsDeliveryTerminal(status: LogisticsDeliveryStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function requiresLogisticsFailureReason(status: LogisticsDeliveryStatus): boolean {
  return status === "FAILED" || status === "RETURNED" || status === "CANCELLED";
}
