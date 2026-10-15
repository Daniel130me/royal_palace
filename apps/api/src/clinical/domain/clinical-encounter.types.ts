import type {
  ClinicalDiagnosisStatus,
  ClinicalDiagnosisType,
  ClinicalDocumentation,
  ClinicalEncounterListResponse,
  ClinicalEncounterResponse,
  ClinicalObservationValueType,
  CursorPageInfo,
} from "@royal-palace/contracts";

export interface ClinicalEncounterAccessRecord extends ClinicalEncounterResponse {
  patientPrincipalId: string;
  practitionerPrincipalId: string;
}

export interface ClinicalEncounterScope {
  id: string;
  patientPrincipalId: string;
  practitionerPrincipalId: string;
  status: "OPEN" | "SIGNED";
}

export interface ClinicalEncounterAccessList {
  data: readonly ClinicalEncounterAccessRecord[];
  pageInfo: CursorPageInfo;
}

export interface ClinicalDiagnosisDraft {
  code?: string;
  codeSystem?: string;
  display: string;
  onsetAt?: Date;
  status: ClinicalDiagnosisStatus;
  type: ClinicalDiagnosisType;
}

export type ClinicalObservationDraft = {
  code: string;
  codeSystem?: string;
  display: string;
  observedAt: Date;
  unitCode?: string;
} & (
  | { numericValue: string; valueType: "QUANTITY" }
  | { textValue: string; valueType: "TEXT" }
  | { codedValue: string; valueType: "CODED" }
  | { booleanValue: boolean; valueType: "BOOLEAN" }
);

export interface ClinicalMutationEnvelope {
  actorPrincipalId: string;
  expectedLatestRevision: number;
  idempotencyKey: string;
  requestHash: string;
  traceRequestId: string;
}

export class ClinicalEncounterConflictError extends Error {
  constructor(
    readonly reason:
      "IDEMPOTENCY_CONFLICT" | "INVALID_STATE" | "REVISION_CONFLICT" | "VERSION_CONFLICT",
  ) {
    super(reason);
    this.name = "ClinicalEncounterConflictError";
  }
}

export interface ClinicalEncounterRepository {
  appendAddendum(
    input: ClinicalMutationEnvelope & {
      diagnoses: readonly ClinicalDiagnosisDraft[];
      documentation: ClinicalDocumentation;
      encounterId: string;
      observations: readonly ClinicalObservationDraft[];
      schemaVersion: number;
      supersedesNoteId: string;
    },
  ): Promise<ClinicalEncounterAccessRecord>;
  findById(encounterId: string): Promise<ClinicalEncounterAccessRecord | null>;
  findPatientRecord(input: {
    encounterId: string;
    patientPrincipalId: string;
  }): Promise<ClinicalEncounterAccessRecord | null>;
  findScopeById(encounterId: string): Promise<ClinicalEncounterScope | null>;
  findAppointmentScope(appointmentId: string): Promise<{
    id: string;
    patientPrincipalId: string;
    practitionerId: string;
    practitionerPrincipalId: string;
    status: string;
  } | null>;
  findPractitionerByPrincipal(principalId: string): Promise<{
    id: string;
    principalId: string;
    verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
  } | null>;
  listByPatient(input: {
    cursor?: { id: string; openedAt: Date };
    limit: number;
    patientPrincipalId: string;
  }): Promise<ClinicalEncounterAccessList>;
  listByPractitioner(input: {
    cursor?: { id: string; openedAt: Date };
    limit: number;
    patientId?: string;
    practitionerPrincipalId: string;
  }): Promise<ClinicalEncounterAccessList>;
  open(input: {
    actorPrincipalId: string;
    appointmentId: string;
    idempotencyKey: string;
    practitionerId: string;
    requestHash: string;
    traceRequestId: string;
  }): Promise<ClinicalEncounterAccessRecord>;
  saveDraft(
    input: ClinicalMutationEnvelope & {
      documentation: ClinicalDocumentation;
      encounterId: string;
      schemaVersion: number;
    },
  ): Promise<ClinicalEncounterAccessRecord>;
  sign(
    input: ClinicalMutationEnvelope & {
      diagnoses: readonly ClinicalDiagnosisDraft[];
      documentation: ClinicalDocumentation;
      encounterId: string;
      expectedVersion: number;
      observations: readonly ClinicalObservationDraft[];
      schemaVersion: number;
    },
  ): Promise<ClinicalEncounterAccessRecord>;
}

export const CLINICAL_ENCOUNTER_REPOSITORY = Symbol("CLINICAL_ENCOUNTER_REPOSITORY");

export type { ClinicalEncounterListResponse, ClinicalObservationValueType };
