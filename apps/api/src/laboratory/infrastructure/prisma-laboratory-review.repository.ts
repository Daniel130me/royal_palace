import { Inject, Injectable } from "@nestjs/common";
import type {
  LaboratoryReviewListResponse,
  LaboratoryReviewModerationItemResponse,
  LaboratoryReviewModerationListResponse,
  LaboratoryReviewResponse,
  ReviewCommentStatus as ContractReviewCommentStatus,
  ReviewModerationDecision,
  ReviewModerationReasonCode,
} from "@royal-palace/contracts";

import { Prisma, type ReviewCommentStatus } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  LaboratoryReviewConflictError,
  type LaboratoryReviewEligibility,
  type LaboratoryReviewRepository,
} from "../domain/laboratory-review.types.js";

const reviewSelect = {
  bookingId: true,
  comment: true,
  commentStatus: true,
  id: true,
  score: true,
  submittedAt: true,
} satisfies Prisma.LaboratoryBookingReviewSelect;

const moderationSelect = {
  comment: true,
  commentStatus: true,
  id: true,
  laboratoryOrganization: { select: { displayName: true, id: true } },
  moderatedAt: true,
  moderationReasonCode: true,
  score: true,
  submittedAt: true,
  version: true,
} satisfies Prisma.LaboratoryBookingReviewSelect;

@Injectable()
export class PrismaLaboratoryReviewRepository implements LaboratoryReviewRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findEligibility(bookingId: string): Promise<LaboratoryReviewEligibility | null> {
    const booking = await this.database.laboratoryBooking.findUnique({
      select: {
        id: true,
        laboratoryOrganizationId: true,
        request: {
          select: {
            patient: { select: { id: true, principalId: true } },
          },
        },
        status: true,
      },
      where: { id: bookingId },
    });
    return booking === null
      ? null
      : {
          bookingId: booking.id,
          laboratoryOrganizationId: booking.laboratoryOrganizationId,
          patientId: booking.request.patient.id,
          patientPrincipalId: booking.request.patient.principalId,
          status: booking.status,
        };
  }

  async listForPatient(input: {
    limit: number;
    patientPrincipalId: string;
  }): Promise<LaboratoryReviewListResponse> {
    const rows = await this.database.laboratoryBooking.findMany({
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      select: {
        completedAt: true,
        id: true,
        laboratoryOrganization: { select: { displayName: true, id: true } },
        request: { select: { service: { select: { code: true, id: true, name: true } } } },
        review: { select: reviewSelect },
      },
      take: input.limit,
      where: {
        request: { patient: { principalId: input.patientPrincipalId } },
        status: "COMPLETED",
      },
    });
    return {
      data: rows.map((row) => ({
        bookingId: row.id,
        completedAt: requiredDate(row.completedAt).toISOString(),
        laboratory: row.laboratoryOrganization,
        review: row.review === null ? null : mapReview(row.review),
        service: row.request.service,
      })),
    };
  }

  async listForModeration(input: {
    cursor?: { id: string; submittedAt: Date };
    limit: number;
    status: Exclude<ContractReviewCommentStatus, "NOT_PROVIDED">;
  }): Promise<LaboratoryReviewModerationListResponse> {
    const rows = await this.database.laboratoryBookingReview.findMany({
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: moderationSelect,
      take: input.limit + 1,
      where: {
        commentStatus: input.status as ReviewCommentStatus,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { submittedAt: { gt: input.cursor.submittedAt } },
                { id: { gt: input.cursor.id }, submittedAt: input.cursor.submittedAt },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const page = hasNextPage ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(mapModerationItem),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? Buffer.from(
                JSON.stringify({ id: last.id, submittedAt: last.submittedAt.toISOString() }),
              ).toString("base64url")
            : null,
        hasNextPage,
      },
    };
  }

  async moderate(input: {
    actorPrincipalId: string;
    decision: ReviewModerationDecision;
    expectedVersion: number;
    reasonCode?: ReviewModerationReasonCode;
    requestId: string;
    reviewId: string;
  }): Promise<LaboratoryReviewModerationItemResponse> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const existing = await transaction.laboratoryBookingReview.findUnique({
            select: {
              comment: true,
              commentStatus: true,
              laboratoryOrganizationId: true,
              patientId: true,
              version: true,
            },
            where: { id: input.reviewId },
          });
          if (existing === null) throw new LaboratoryReviewConflictError("NOT_FOUND");
          if (existing.comment === null || existing.commentStatus !== "PENDING") {
            throw new LaboratoryReviewConflictError("ALREADY_MODERATED");
          }
          if (existing.version !== input.expectedVersion) {
            throw new LaboratoryReviewConflictError("VERSION_CONFLICT");
          }
          const now = new Date();
          const updated = await transaction.laboratoryBookingReview.updateMany({
            data: {
              commentStatus: input.decision === "PUBLISH" ? "PUBLISHED" : "HIDDEN",
              moderatedAt: now,
              moderatedByPrincipalId: input.actorPrincipalId,
              moderationReasonCode: input.decision === "HIDE" ? input.reasonCode : null,
              version: { increment: 1 },
            },
            where: { id: input.reviewId, commentStatus: "PENDING", version: input.expectedVersion },
          });
          if (updated.count !== 1) throw new LaboratoryReviewConflictError("VERSION_CONFLICT");
          await transaction.auditEvent.create({
            data: {
              action:
                input.decision === "PUBLISH"
                  ? "laboratory.review_comment.published"
                  : "laboratory.review_comment.hidden",
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              organizationId: existing.laboratoryOrganizationId,
              patientScopeId: existing.patientId,
              requestId: input.requestId,
              resourceId: input.reviewId,
              resourceType: "laboratory_booking_review",
              result: "SUCCEEDED",
            },
          });
          const review = await transaction.laboratoryBookingReview.findUniqueOrThrow({
            select: moderationSelect,
            where: { id: input.reviewId },
          });
          return mapModerationItem(review);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new LaboratoryReviewConflictError("VERSION_CONFLICT");
      }
      throw error;
    }
  }

  async submit(input: {
    actorPrincipalId: string;
    bookingId: string;
    comment?: string;
    laboratoryOrganizationId: string;
    patientId: string;
    requestId: string;
    score: number;
  }): Promise<LaboratoryReviewResponse> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const booking = await transaction.laboratoryBooking.findUnique({
            select: {
              laboratoryOrganizationId: true,
              request: { select: { patientId: true } },
              status: true,
            },
            where: { id: input.bookingId },
          });
          if (
            booking === null ||
            booking.status !== "COMPLETED" ||
            booking.request.patientId !== input.patientId ||
            booking.laboratoryOrganizationId !== input.laboratoryOrganizationId
          ) {
            throw new LaboratoryReviewConflictError("INVALID_STATE");
          }
          const now = new Date();
          const review = await transaction.laboratoryBookingReview.create({
            data: {
              bookingId: input.bookingId,
              ...(input.comment === undefined
                ? { commentStatus: "NOT_PROVIDED" as ReviewCommentStatus }
                : { comment: input.comment, commentStatus: "PENDING" as ReviewCommentStatus }),
              id: createOpaqueId(),
              laboratoryOrganizationId: input.laboratoryOrganizationId,
              patientId: input.patientId,
              score: input.score,
              submittedAt: now,
            },
            select: reviewSelect,
          });
          await transaction.auditEvent.create({
            data: {
              action: "laboratory.review.submitted",
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              organizationId: input.laboratoryOrganizationId,
              patientScopeId: input.patientId,
              requestId: input.requestId,
              resourceId: review.id,
              resourceType: "laboratory_booking_review",
              result: "SUCCEEDED",
            },
          });
          return mapReview(review);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new LaboratoryReviewConflictError("ALREADY_REVIEWED");
      }
      throw error;
    }
  }
}

function mapReview(row: {
  bookingId: string;
  comment: string | null;
  commentStatus: ReviewCommentStatus;
  id: string;
  score: number;
  submittedAt: Date;
}): LaboratoryReviewResponse {
  return {
    bookingId: row.bookingId,
    comment: row.comment,
    commentStatus: row.commentStatus,
    id: row.id,
    score: row.score,
    submittedAt: row.submittedAt.toISOString(),
  };
}

function mapModerationItem(row: {
  comment: string | null;
  commentStatus: ReviewCommentStatus;
  id: string;
  laboratoryOrganization: { displayName: string; id: string };
  moderatedAt: Date | null;
  moderationReasonCode: string | null;
  score: number;
  submittedAt: Date;
  version: number;
}): LaboratoryReviewModerationItemResponse {
  if (row.comment === null || row.commentStatus === "NOT_PROVIDED") {
    throw new LaboratoryReviewConflictError("INVALID_STATE");
  }
  return {
    comment: row.comment,
    commentStatus: row.commentStatus,
    id: row.id,
    laboratory: row.laboratoryOrganization,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    moderationReasonCode: row.moderationReasonCode as ReviewModerationReasonCode | null,
    score: row.score,
    submittedAt: row.submittedAt.toISOString(),
    version: row.version,
  };
}

function requiredDate(value: Date | null) {
  if (value === null) throw new LaboratoryReviewConflictError("INVALID_STATE");
  return value;
}
