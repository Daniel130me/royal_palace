import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  LABORATORY_REVIEW_REPOSITORY,
  LaboratoryReviewConflictError,
  type LaboratoryReviewRepository,
} from "../domain/laboratory-review.types.js";
import { LaboratoryFlowError } from "./laboratory.service.js";

interface ReviewContext {
  actor: CurrentSession;
  requestId: string;
}

@Injectable()
export class LaboratoryReviewService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(LABORATORY_REVIEW_REPOSITORY)
    private readonly repository: LaboratoryReviewRepository,
  ) {}

  async listForPatient(context: ReviewContext, limit: number) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "laboratory_review_list",
      },
      policy: AUTHORIZATION_POLICY.SUBMIT_SERVICE_REVIEW,
      requestId: context.requestId,
    });
    return this.repository.listForPatient({
      limit,
      patientPrincipalId: context.actor.principalId,
    });
  }

  async submit(
    context: ReviewContext,
    bookingId: string,
    input: { comment?: string; score: number },
  ) {
    const eligibility = await this.repository.findEligibility(bookingId);
    if (eligibility === null) {
      throw new LaboratoryFlowError("laboratory_booking_not_found", 404, "Booking not found");
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: eligibility.patientPrincipalId,
        resourceId: bookingId,
        resourceType: "laboratory_booking_review",
      },
      policy: AUTHORIZATION_POLICY.SUBMIT_SERVICE_REVIEW,
      requestId: context.requestId,
    });
    if (eligibility.status !== "COMPLETED") {
      throw new LaboratoryFlowError(
        "service_not_completed",
        409,
        "A rating can be submitted only after the service is completed",
      );
    }
    try {
      return await this.repository.submit({
        actorPrincipalId: context.actor.principalId,
        bookingId,
        ...(input.comment === undefined ? {} : { comment: input.comment }),
        laboratoryOrganizationId: eligibility.laboratoryOrganizationId,
        patientId: eligibility.patientId,
        requestId: context.requestId,
        score: input.score,
      });
    } catch (error) {
      if (error instanceof LaboratoryReviewConflictError) {
        throw new LaboratoryFlowError(
          error.reason === "ALREADY_REVIEWED"
            ? "review_already_submitted"
            : "service_not_completed",
          409,
          error.reason === "ALREADY_REVIEWED"
            ? "This completed service has already been rated"
            : "The service is not eligible for a rating",
        );
      }
      throw error;
    }
  }
}
