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

export interface LaboratoryResultAttachmentAccessRecord {
  cleanObjectKey: string | null;
  cleanVersionId: string | null;
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  id: string;
  laboratoryOrganizationId: string;
  originalFilename: string;
  patientPrincipalId: string;
  practitionerPrincipalId: string;
  resultId: string;
  resultStatus: LaboratoryResultStatus;
  status: "AWAITING_UPLOAD" | "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED";
  storageObjectKey: string | null;
  uploadExpiresAt: Date | null;
}

export interface LaboratoryResultRepository {
  completeAttachmentUpload(input: {
    attachmentId: string;
    organizationId: string;
    quarantineVersionId: string | null;
  }): Promise<boolean>;
  createAttachmentUpload(input: {
    declaredContentType: string;
    declaredSha256: string;
    declaredSizeBytes: number;
    organizationId: string;
    originalFilename: string;
    purpose: string;
    resultId: string;
    uploadExpiresAt: Date;
  }): Promise<{ attachmentId: string; storageObjectKey: string }>;
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
  findAttachmentById(input: {
    attachmentId: string;
    resultId: string;
  }): Promise<LaboratoryResultAttachmentAccessRecord | null>;
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
    cursor?: { createdAt?: Date; id: string; publishedAt?: Date };
    limit: number;
    organizationId?: string;
    patientId?: string;
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
  rejectAttachmentUpload(input: {
    attachmentId: string;
    organizationId: string;
    reasonCode: string;
  }): Promise<void>;
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
