import { describe, expect, it } from "vitest";

import {
  canAppendClinicalNote,
  canTransitionClinicalEncounter,
  isClinicalEncounterImmutable,
} from "../src/clinical/domain/clinical-encounter-state-machine.js";

describe("clinical encounter state machine", () => {
  it("allows only the irreversible open-to-signed transition", () => {
    expect(canTransitionClinicalEncounter("OPEN", "SIGNED")).toBe(true);
    expect(canTransitionClinicalEncounter("OPEN", "OPEN")).toBe(false);
    expect(canTransitionClinicalEncounter("SIGNED", "OPEN")).toBe(false);
    expect(canTransitionClinicalEncounter("SIGNED", "SIGNED")).toBe(false);
  });

  it("accepts drafts and the signed base note only while open", () => {
    expect(canAppendClinicalNote("OPEN", "DRAFT")).toBe(true);
    expect(canAppendClinicalNote("OPEN", "SIGNED")).toBe(true);
    expect(canAppendClinicalNote("OPEN", "ADDENDUM")).toBe(false);
  });

  it("accepts only append-only addenda after signing", () => {
    expect(canAppendClinicalNote("SIGNED", "DRAFT")).toBe(false);
    expect(canAppendClinicalNote("SIGNED", "SIGNED")).toBe(false);
    expect(canAppendClinicalNote("SIGNED", "ADDENDUM")).toBe(true);
    expect(isClinicalEncounterImmutable("SIGNED")).toBe(true);
    expect(isClinicalEncounterImmutable("OPEN")).toBe(false);
  });
});
