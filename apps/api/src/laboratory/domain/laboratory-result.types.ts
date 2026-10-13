import type {
  LaboratoryCriticalResultResponse,
  LaboratoryResultFlag,
  LaboratoryResultListResponse,
  LaboratoryResultResponse,
  LaboratoryResultStatus,
} from "@royal-palace/contracts";

export interface LaboratoryResultComponentDraft {
  code?: string;
  codeSystem?: string;
  flag: LaboratoryResultFlag;
  name: string;
  note?: string;
  referenceRange?: string;
  unit?: string;
  value: string;
}

export interface LaboratoryResultDraft {
  bookingId: string;
  components: readonly LaboratoryResultComponentDraft[];
  interpretation?: string;
}

export interface LaboratoryResultAccessRecord extends LaboratoryResultResponse {
  laboratoryOrganizationId: string;
  patientPrincipalId: string;
  practitionerPrincipalId: string;
}

export interface LaboratoryCriticalResultAccessRecord extends LaboratoryCriticalResultResponse {
  practitionerPrincipalId: string;
  resultId: string;
}

export interface LaboratoryResultRepository {
  acknowledgeCritical(input: {
    actorPrincipalId: string;
    criticalResultId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<LaboratoryCriticalResultAccessRecord | null>;
  createAmendment(input: {
    actorPrincipalId: string;
    components: readonly LaboratoryResultComponentDraft[];
    interpretation?: string;
    organizationId: string;
    previousResultId: string;
    requestId: string;
  }): Promise<LaboratoryResultAccessRecord>;
  createDraft(input: {
    actorPrincipalId: string;
    draft: LaboratoryResultDraft;
    idempotencyKey: string;
    organizationId: string;
    requestHash: string;
    requestId: string;
  }): Promise<LaboratoryResultAccessRecord>;
  findCriticalById(criticalResultId: string): Promise<LaboratoryCriticalResultAccessRecord | null>;
  findResultById(resultId: string): Promise<LaboratoryResultAccessRecord | null>;
  listCriticalByPractitioner(input: {
    cursor?: { acknowledgementDueAt: Date; id: string };
    limit: number;
    practitionerPrincipalId: string;
    status?: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";
  }): Promise<{
    data: readonly LaboratoryCriticalResultAccessRecord[];
    pageInfo: LaboratoryResultListResponse["pageInfo"];
  }>;
  listResults(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    organizationId?: string;
    patientPrincipalId?: string;
    practitionerPrincipalId?: string;
    status?: LaboratoryResultStatus;
  }): Promise<LaboratoryResultListResponse>;
  publish(input: {
    acknowledgementSeconds: number;
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    requestId: string;
    resultId: string;
  }): Promise<LaboratoryResultAccessRecord | null>;
  resolveCritical(input: {
    actorPrincipalId: string;
    criticalResultId: string;
    expectedVersion: number;
    requestId: string;
    resolutionCode: string;
  }): Promise<LaboratoryCriticalResultAccessRecord | null>;
  transitionResult(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    reasonCode: string;
    requestId: string;
    resultId: string;
    toStatus: "DRAFT" | "IN_REVIEW";
  }): Promise<LaboratoryResultAccessRecord | null>;
  updateDraft(input: {
    actorPrincipalId: string;
    components: readonly LaboratoryResultComponentDraft[];
    expectedVersion: number;
    interpretation?: string;
    organizationId: string;
    requestId: string;
    resultId: string;
  }): Promise<LaboratoryResultAccessRecord | null>;
}

export const LABORATORY_RESULT_REPOSITORY = Symbol("LABORATORY_RESULT_REPOSITORY");
