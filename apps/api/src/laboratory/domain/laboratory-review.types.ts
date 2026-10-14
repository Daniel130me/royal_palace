import type {
  LaboratoryReviewListResponse,
  LaboratoryReviewResponse,
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
  constructor(readonly reason: "ALREADY_REVIEWED" | "INVALID_STATE") {
    super(reason);
    this.name = "LaboratoryReviewConflictError";
  }
}

export const LABORATORY_REVIEW_REPOSITORY = Symbol("LABORATORY_REVIEW_REPOSITORY");
