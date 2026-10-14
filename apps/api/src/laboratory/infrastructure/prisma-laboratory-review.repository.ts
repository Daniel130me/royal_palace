import { Inject, Injectable } from "@nestjs/common";
import type {
  LaboratoryReviewListResponse,
  LaboratoryReviewResponse,
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

function requiredDate(value: Date | null) {
  if (value === null) throw new LaboratoryReviewConflictError("INVALID_STATE");
  return value;
}
