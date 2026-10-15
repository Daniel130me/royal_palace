import type { LogisticsComponents } from "@royal-palace/api-client";

export type LogisticsDelivery = LogisticsComponents["schemas"]["LogisticsDelivery"];
export type LogisticsDeliveryStatus = LogisticsComponents["schemas"]["DeliveryStatus"];
export type MutableLogisticsDeliveryStatus =
  LogisticsComponents["schemas"]["MutableDeliveryStatus"];
export type LogisticsHistoryItem = LogisticsComponents["schemas"]["DeliveryHistoryItem"];

export const TERMINAL_LOGISTICS_STATUSES = [
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
] as const satisfies readonly LogisticsDeliveryStatus[];

export function isTerminalLogisticsStatus(status: LogisticsDeliveryStatus): boolean {
  return TERMINAL_LOGISTICS_STATUSES.includes(
    status as (typeof TERMINAL_LOGISTICS_STATUSES)[number],
  );
}
