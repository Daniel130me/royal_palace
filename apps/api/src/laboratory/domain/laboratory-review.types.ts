import type {
  LaboratoryReviewListResponse,
  LaboratoryReviewModerationItemResponse,
  LaboratoryReviewModerationListResponse,
  LaboratoryReviewResponse,
  ReviewCommentStatus,
  ReviewModerationDecision,
  ReviewModerationReasonCode,
} from "@royal-palace/contracts";

export interface LaboratoryReviewEligibility {
  bookingId: string;
  laboratoryOrganizationId: string;
  patientId: string;
  patientPrincipalId: string;
  status: string;
}

export interface LaboratoryReviewRepository {
  findEligibility(bookingId: string): Promise<LaboratoryReviewEligibility | null>;
  listForPatient(input: {
    limit: number;
    patientPrincipalId: string;
  }): Promise<LaboratoryReviewListResponse>;
  listForModeration(input: {
    cursor?: { id: string; submittedAt: Date };
    limit: number;
    status: Exclude<ReviewCommentStatus, "NOT_PROVIDED">;
  }): Promise<LaboratoryReviewModerationListResponse>;
  moderate(input: {
    actorPrincipalId: string;
    decision: ReviewModerationDecision;
    expectedVersion: number;
    reasonCode?: ReviewModerationReasonCode;
    requestId: string;
    reviewId: string;
  }): Promise<LaboratoryReviewModerationItemResponse>;
  submit(input: {
    actorPrincipalId: string;
    bookingId: string;
    comment?: string;
    laboratoryOrganizationId: string;
    patientId: string;
    requestId: string;
    score: number;
  }): Promise<LaboratoryReviewResponse>;
}

export class LaboratoryReviewConflictError extends Error {
  constructor(
    readonly reason:
      "ALREADY_MODERATED" | "ALREADY_REVIEWED" | "INVALID_STATE" | "NOT_FOUND" | "VERSION_CONFLICT",
  ) {
    super(reason);
    this.name = "LaboratoryReviewConflictError";
  }
}

export const LABORATORY_REVIEW_REPOSITORY = Symbol("LABORATORY_REVIEW_REPOSITORY");
