import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { LaboratoryReviewService } from "../application/laboratory-review.service.js";
import { context, execute, parse } from "./laboratory.controller.js";

const idSchema = z.uuid();
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) }).strict();
const reviewSchema = z
  .object({
    comment: z.string().trim().min(1).max(2000).optional(),
    score: z.number().int().min(1).max(5),
  })
  .strict();
const moderationListSchema = z
  .object({
    cursor: z.string().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    status: z.enum(["PENDING", "PUBLISHED", "HIDDEN"]).default("PENDING"),
  })
  .strict();
const moderationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("PUBLISH"), expectedVersion: z.number().int().min(1) }).strict(),
  z
    .object({
      decision: z.literal("HIDE"),
      expectedVersion: z.number().int().min(1),
      reasonCode: z.enum([
        "ABUSIVE_OR_HARASSING",
        "CLINICAL_DETAILS",
        "IRRELEVANT",
        "PERSONAL_DATA",
        "SPAM_OR_FRAUD",
      ]),
    })
    .strict(),
]);

@Controller("v1/patient")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientLaboratoryReviewController {
  constructor(@Inject(LaboratoryReviewService) private readonly reviews: LaboratoryReviewService) {}

  @Get("laboratory-reviews")
  @PolicyProtected(AUTHORIZATION_POLICY.SUBMIT_SERVICE_REVIEW)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { limit } = parse(listSchema, query);
    return execute(() => this.reviews.listForPatient(context(request), limit));
  }

  @Post("laboratory-bookings/:bookingId/reviews")
  @PolicyProtected(AUTHORIZATION_POLICY.SUBMIT_SERVICE_REVIEW)
  submit(
    @Param("bookingId") bookingId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.reviews.submit(context(request), parse(idSchema, bookingId), parse(reviewSchema, body)),
    );
  }
}

@Controller("v1/admin/review-comments")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminLaboratoryReviewController {
  constructor(@Inject(LaboratoryReviewService) private readonly reviews: LaboratoryReviewService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_REVIEW_MODERATION)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.reviews.listForModeration(context(request), parse(moderationListSchema, query)),
    );
  }

  @Post(":reviewId/decision")
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_REVIEW_MODERATION)
  moderate(
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.reviews.moderate(
        context(request),
        parse(idSchema, reviewId),
        parse(moderationDecisionSchema, body),
      ),
    );
  }
}
