import { describe, expect, it } from "vitest";

import {
  canTransitionLogisticsDelivery,
  isLogisticsDeliveryTerminal,
  requiresLogisticsFailureReason,
} from "../src/logistics/domain/logistics-delivery-state-machine.js";

describe("logistics delivery state machine", () => {
  it("preserves the signed pickup-to-delivery workflow in order", () => {
    expect(canTransitionLogisticsDelivery("ASSIGNED", "ACCEPTED")).toBe(true);
    expect(canTransitionLogisticsDelivery("ACCEPTED", "HEADING_TO_PICKUP")).toBe(true);
    expect(canTransitionLogisticsDelivery("HEADING_TO_PICKUP", "ARRIVED_AT_PICKUP")).toBe(true);
    expect(canTransitionLogisticsDelivery("ARRIVED_AT_PICKUP", "PICKUP_VERIFIED")).toBe(true);
    expect(canTransitionLogisticsDelivery("PICKUP_VERIFIED", "PICKED_UP")).toBe(true);
    expect(canTransitionLogisticsDelivery("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionLogisticsDelivery("IN_TRANSIT", "ARRIVED_AT_DESTINATION")).toBe(true);
    expect(canTransitionLogisticsDelivery("ARRIVED_AT_DESTINATION", "DELIVERED")).toBe(true);
  });

  it("rejects skipped, reopened, and post-custody cancellation transitions", () => {
    expect(canTransitionLogisticsDelivery("ASSIGNED", "PICKED_UP")).toBe(false);
    expect(canTransitionLogisticsDelivery("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransitionLogisticsDelivery("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionLogisticsDelivery("FAILED", "ASSIGNED")).toBe(false);
  });

  it("supports explicit terminal exception outcomes", () => {
    expect(canTransitionLogisticsDelivery("HEADING_TO_PICKUP", "FAILED")).toBe(true);
    expect(canTransitionLogisticsDelivery("IN_TRANSIT", "RETURNED")).toBe(true);
    expect(canTransitionLogisticsDelivery("ACCEPTED", "CANCELLED")).toBe(true);
    expect(isLogisticsDeliveryTerminal("DELIVERED")).toBe(true);
    expect(isLogisticsDeliveryTerminal("RETURNED")).toBe(true);
    expect(isLogisticsDeliveryTerminal("IN_TRANSIT")).toBe(false);
  });

  it("requires controlled reasons for non-success terminal outcomes", () => {
    expect(requiresLogisticsFailureReason("FAILED")).toBe(true);
    expect(requiresLogisticsFailureReason("RETURNED")).toBe(true);
    expect(requiresLogisticsFailureReason("CANCELLED")).toBe(true);
    expect(requiresLogisticsFailureReason("DELIVERED")).toBe(false);
  });
});
