import { describe, expect, it } from "vitest";

import {
  canTransitionLaboratoryBooking,
  canTransitionLaboratoryRequest,
  isLaboratoryBookingTerminal,
  isLaboratoryRequestTerminal,
} from "../src/laboratory/domain/laboratory-state-machine.js";

describe("laboratory state machines", () => {
  it("limits request transitions to cancellation or verified completion", () => {
    expect(canTransitionLaboratoryRequest("ACTIVE", "CANCELLED")).toBe(true);
    expect(canTransitionLaboratoryRequest("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransitionLaboratoryRequest("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransitionLaboratoryRequest("CANCELLED", "COMPLETED")).toBe(false);
  });

  it("supports the controlled specimen-to-result booking workflow", () => {
    expect(canTransitionLaboratoryBooking("CONFIRMED", "SAMPLE_COLLECTION_PENDING")).toBe(true);
    expect(canTransitionLaboratoryBooking("CONFIRMED", "SAMPLE_COLLECTED")).toBe(true);
    expect(canTransitionLaboratoryBooking("SAMPLE_COLLECTED", "PROCESSING")).toBe(true);
    expect(canTransitionLaboratoryBooking("PROCESSING", "RESULT_READY")).toBe(true);
    expect(canTransitionLaboratoryBooking("RESULT_READY", "COMPLETED")).toBe(true);
    expect(canTransitionLaboratoryBooking("CONFIRMED", "RESULT_READY")).toBe(false);
    expect(canTransitionLaboratoryBooking("RESULT_READY", "CANCELLED")).toBe(false);
  });

  it("treats completed and cancelled records as terminal", () => {
    expect(isLaboratoryRequestTerminal("COMPLETED")).toBe(true);
    expect(isLaboratoryRequestTerminal("ACTIVE")).toBe(false);
    expect(isLaboratoryBookingTerminal("CANCELLED")).toBe(true);
    expect(isLaboratoryBookingTerminal("RESULT_READY")).toBe(false);
  });
});
