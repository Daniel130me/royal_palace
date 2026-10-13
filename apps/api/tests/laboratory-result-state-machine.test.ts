import { describe, expect, it } from "vitest";

import {
  canTransitionLaboratoryCriticalResult,
  canTransitionLaboratoryResult,
  isLaboratoryCriticalResultTerminal,
  isLaboratoryResultTerminal,
} from "../src/laboratory/domain/laboratory-state-machine.js";

describe("laboratory result state machines", () => {
  it("requires review before publication and prevents published result editing", () => {
    expect(canTransitionLaboratoryResult("DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransitionLaboratoryResult("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionLaboratoryResult("IN_REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransitionLaboratoryResult("PUBLISHED", "DRAFT")).toBe(false);
    expect(canTransitionLaboratoryResult("PUBLISHED", "SUPERSEDED")).toBe(true);
    expect(isLaboratoryResultTerminal("SUPERSEDED")).toBe(true);
  });

  it("permits time-bound escalation and keeps resolved critical events terminal", () => {
    expect(canTransitionLaboratoryCriticalResult("OPEN", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionLaboratoryCriticalResult("OPEN", "ESCALATED")).toBe(true);
    expect(canTransitionLaboratoryCriticalResult("ESCALATED", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionLaboratoryCriticalResult("ACKNOWLEDGED", "RESOLVED")).toBe(true);
    expect(canTransitionLaboratoryCriticalResult("RESOLVED", "OPEN")).toBe(false);
    expect(isLaboratoryCriticalResultTerminal("RESOLVED")).toBe(true);
  });
});
