import type {
  ClinicalDiagnosisStatus,
  ClinicalDiagnosisType,
  ClinicalDocumentation,
  ClinicalEncounterListResponse,
  ClinicalEncounterResponse,
  ClinicalObservationValueType,
  CursorPageInfo,
  ProviderPatientRosterItem,
  ProviderReferralListItem,
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

export interface ProviderPatientRosterList {
  data: readonly ProviderPatientRosterItem[];
  pageInfo: CursorPageInfo;
}

export interface ProviderReferralAccessList {
  data: readonly ProviderReferralListItem[];
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
  createRelatedAction(input: {
    actorPrincipalId: string;
    encounterId: string;
    idempotencyKey: string;
    requestHash: string;
    traceRequestId: string;
    action:
      | {
          kind: "REFERRAL";
          priority: "ROUTINE" | "URGENT" | "EMERGENCY";
          reason: string;
          recipientName?: string;
          recipientPractitionerId?: string;
          specialtyCode: string;
        }
      | {
          activities: readonly string[];
          endsAt?: Date;
          goal: string;
          kind: "CARE_PLAN";
          startsAt: Date;
          title: string;
        }
      | {
          criticality: "LOW" | "HIGH" | "UNABLE_TO_ASSESS";
          kind: "ALLERGY";
          reaction?: string;
          substanceCode?: string;
          substanceCodeSystem?: string;
          substanceDisplay: string;
        }
      | {
          kind: "ATTACHMENT_REFERENCE";
          purpose: string;
          sourceId: string;
          sourceType:
            "LABORATORY_RESULT_ATTACHMENT" | "SCANNED_PRESCRIPTION" | "APPLICATION_DOCUMENT";
        };
  }): Promise<ClinicalEncounterAccessRecord>;
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
  findPatientRecordByAppointment(input: {
    appointmentId: string;
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
  findVerifiedPractitionerById(practitionerId: string): Promise<{
    displayName: string;
    id: string;
    principalId: string;
  } | null>;
  listPatientsByPractitioner(input: {
    cursor?: { id: string; lastEncounterAt: Date };
    limit: number;
    practitionerPrincipalId: string;
    query?: string;
  }): Promise<ProviderPatientRosterList>;
  listReferralsByPractitioner(input: {
    cursor?: { createdAt: Date; id: string };
    direction: "RECEIVED" | "SENT";
    limit: number;
    practitionerPrincipalId: string;
  }): Promise<ProviderReferralAccessList>;
  transitionReceivedReferral(input: {
    actorPrincipalId: string;
    decision: "ACCEPTED" | "DECLINED";
    expectedVersion: number;
    idempotencyKey: string;
    referralId: string;
    requestHash: string;
    traceRequestId: string;
  }): Promise<ProviderReferralListItem>;
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
