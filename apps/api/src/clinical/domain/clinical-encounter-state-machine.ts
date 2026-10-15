export type ClinicalEncounterStatus = "OPEN" | "SIGNED";

export type ClinicalNoteKind = "DRAFT" | "SIGNED" | "ADDENDUM";

const ENCOUNTER_TRANSITIONS: Readonly<
  Record<ClinicalEncounterStatus, readonly ClinicalEncounterStatus[]>
> = {
  OPEN: ["SIGNED"],
  SIGNED: [],
};

export function canTransitionClinicalEncounter(
  from: ClinicalEncounterStatus,
  to: ClinicalEncounterStatus,
): boolean {
  return ENCOUNTER_TRANSITIONS[from].includes(to);
}

export function canAppendClinicalNote(
  encounterStatus: ClinicalEncounterStatus,
  noteKind: ClinicalNoteKind,
): boolean {
  if (encounterStatus === "OPEN") {
    return noteKind === "DRAFT" || noteKind === "SIGNED";
  }

  return noteKind === "ADDENDUM";
}

export function isClinicalEncounterImmutable(status: ClinicalEncounterStatus): boolean {
  return status === "SIGNED";
}
