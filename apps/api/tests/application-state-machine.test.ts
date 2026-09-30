import { describe, expect, it } from "vitest";

import {
  assertApplicationTransition,
  InvalidApplicationTransitionError,
  isApplicantEditable,
  isTerminalApplicationStatus,
} from "../src/onboarding/domain/application-state-machine.js";

describe("onboarding application state machine", () => {
  it("permits the reviewed approval path", () => {
    expect(() => assertApplicationTransition("DRAFT", "SUBMITTED")).not.toThrow();
    expect(() => assertApplicationTransition("SUBMITTED", "UNDER_REVIEW")).not.toThrow();
    expect(() => assertApplicationTransition("UNDER_REVIEW", "APPROVED")).not.toThrow();
  });

  it("rejects skipped, repeated, and terminal transitions", () => {
    expect(() => assertApplicationTransition("DRAFT", "APPROVED")).toThrow(
      InvalidApplicationTransitionError,
    );
    expect(() => assertApplicationTransition("UNDER_REVIEW", "UNDER_REVIEW")).toThrow(
      InvalidApplicationTransitionError,
    );
    expect(() => assertApplicationTransition("APPROVED", "REJECTED")).toThrow(
      InvalidApplicationTransitionError,
    );
  });

  it("limits applicant edits and identifies terminal states", () => {
    expect(isApplicantEditable("DRAFT")).toBe(true);
    expect(isApplicantEditable("MORE_INFORMATION_REQUIRED")).toBe(true);
    expect(isApplicantEditable("UNDER_REVIEW")).toBe(false);
    expect(isTerminalApplicationStatus("APPROVED")).toBe(true);
    expect(isTerminalApplicationStatus("WITHDRAWN")).toBe(true);
    expect(isTerminalApplicationStatus("SUBMITTED")).toBe(false);
  });
});
