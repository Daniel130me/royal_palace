import { describe, expect, it } from "vitest";

import {
  canTransitionPrescription,
  isPrescriptionTerminal,
} from "../src/pharmacy/domain/prescription-state-machine.js";

describe("prescription state machine", () => {
  it("allows only the approved forward and terminal transitions", () => {
    expect(canTransitionPrescription("DRAFT", "SIGNED")).toBe(true);
    expect(canTransitionPrescription("SIGNED", "SENT")).toBe(true);
    expect(canTransitionPrescription("SENT", "ACCEPTED")).toBe(true);
    expect(canTransitionPrescription("SENT", "SIGNED")).toBe(true);
    expect(canTransitionPrescription("ACCEPTED", "SIGNED")).toBe(true);
    expect(canTransitionPrescription("ACCEPTED", "PARTIALLY_DISPENSED")).toBe(true);
    expect(canTransitionPrescription("PARTIALLY_DISPENSED", "DISPENSED")).toBe(true);
    expect(canTransitionPrescription("SENT", "DISPENSED")).toBe(false);
    expect(canTransitionPrescription("PARTIALLY_DISPENSED", "SIGNED")).toBe(false);
    expect(canTransitionPrescription("CANCELLED", "SIGNED")).toBe(false);
  });

  it("treats dispensed, cancelled, and expired prescriptions as terminal", () => {
    expect(isPrescriptionTerminal("DISPENSED")).toBe(true);
    expect(isPrescriptionTerminal("CANCELLED")).toBe(true);
    expect(isPrescriptionTerminal("EXPIRED")).toBe(true);
    expect(isPrescriptionTerminal("ACCEPTED")).toBe(false);
  });
});
