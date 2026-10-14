import { Inject, Injectable } from "@nestjs/common";
import type {
  LaboratoryBookingListResponse,
  LaboratoryBookingStatus,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { canTransitionLaboratoryBooking } from "../domain/laboratory-state-machine.js";
import {
  LaboratoryConflictError,
  type LaboratoryBookingDraft,
  type LaboratoryRequestAccessList,
  type LaboratoryRequestAccessRecord,
  type LaboratoryRequestDraft,
  type LaboratoryRepository,
} from "../domain/laboratory.types.js";

const BOOK_OPERATION = "laboratory.request.book";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

const requestInclude = {
  bookings: {
    include: {
      laboratoryOrganization: { select: { displayName: true, id: true } },
      homeCollection: true,
      statusHistory: true,
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  patient: { select: { familyName: true, givenName: true, id: true, principalId: true } },
  practitioner: { select: { displayName: true, id: true, principalId: true } },
  service: { select: { code: true, id: true, name: true } },
  statusHistory: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.LaboratoryRequestInclude;

type RequestRow = Prisma.LaboratoryRequestGetPayload<{ include: typeof requestInclude }>;

@Injectable()
export class PrismaLaboratoryRepository implements LaboratoryRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findPractitionerByPrincipal(principalId: string) {
    const practitioner = await this.database.practitioner.findUnique({
      select: { id: true, principalId: true, verificationStatus: true },
      where: { principalId },
    });
    if (practitioner === null || practitioner.principalId === null) return null;
    return {
      id: practitioner.id,
      principalId: practitioner.principalId,
      verificationStatus: practitioner.verificationStatus,
    };
  }

  async findById(requestId: string): Promise<LaboratoryRequestAccessRecord | null> {
    const row = await this.database.laboratoryRequest.findUnique({
      include: requestInclude,
      relationLoadStrategy: "join",
      where: { id: requestId },
    });
    return row === null ? null : mapRequest(row);
  }

  async findByBooking(input: { bookingId: string; organizationId: string }) {
    const row = await this.database.laboratoryRequest.findFirst({
      include: {
        ...requestInclude,
        bookings: {
          ...requestInclude.bookings,
          where: { laboratoryOrganizationId: input.organizationId },
        },
      },
      relationLoadStrategy: "join",
      where: {
        bookings: {
          some: { id: input.bookingId, laboratoryOrganizationId: input.organizationId },
        },
      },
    });
    return row === null ? null : mapRequest(row);
  }

  async createRequest(input: {
    actorPrincipalId: string;
    draft: LaboratoryRequestDraft;
    practitionerId: string;
    requestId: string;
  }): Promise<LaboratoryRequestAccessRecord> {
    const requestId = createOpaqueId();
    await this.database.$transaction(async (transaction) => {
      await assertRequestReferences(transaction, input.draft, input.practitionerId);
      const now = new Date();
      await transaction.laboratoryRequest.create({
        data: {
          appointmentId: input.draft.appointmentId,
          clinicalIndication: input.draft.clinicalIndication,
          id: requestId,
          orderedAt: now,
          patientId: input.draft.patientId,
          practitionerId: input.practitionerId,
          priority: input.draft.priority,
          requestNumber: `LAB-${createOpaqueId()}`,
          serviceId: input.draft.serviceId,
          specimenInstructions: input.draft.specimenInstructions,
          statusHistory: {
            create: {
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              occurredAt: now,
              reasonCode: "practitioner_ordered",
              toStatus: "ACTIVE",
            },
          },
          updatedAt: now,
        },
      });
      await transaction.auditEvent.create({
        data: {
          action: "laboratory.request.created",
          actorPrincipalId: input.actorPrincipalId,
          id: createOpaqueId(),
          patientScopeId: input.draft.patientId,
          requestId: input.requestId,
          resourceId: requestId,
          resourceType: "laboratory_request",
          result: "SUCCEEDED",
        },
      });
    });
    return requireLoaded(await this.findById(requestId));
  }

  async book(input: {
    actorPrincipalId: string;
    draft: LaboratoryBookingDraft;
    expectedVersion: number;
    idempotencyKey: string;
    patientPrincipalId: string;
    requestHash: string;
    requestId: string;
    traceRequestId: string;
  }): Promise<LaboratoryRequestAccessRecord | null> {
    try {
      const requestId = await this.database.$transaction(async (transaction) => {
        const existing = await transaction.idempotencyKey.findUnique({
          where: {
            principalId_operation_key: {
              key: input.idempotencyKey,
              operation: BOOK_OPERATION,
              principalId: input.patientPrincipalId,
            },
          },
        });
        if (existing !== null) {
          if (existing.requestHash !== input.requestHash) {
            throw new LaboratoryConflictError("IDEMPOTENCY_CONFLICT");
          }
          if (existing.status === "COMPLETED" && existing.resourceId === input.requestId) {
            return input.requestId;
          }
          throw new LaboratoryConflictError("IDEMPOTENCY_CONFLICT");
        }

        const idempotencyId = createOpaqueId();
        await transaction.idempotencyKey.create({
          data: {
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            id: idempotencyId,
            key: input.idempotencyKey,
            operation: BOOK_OPERATION,
            principalId: input.patientPrincipalId,
            requestHash: input.requestHash,
            updatedAt: new Date(),
          },
        });
        const current = await lockRequest(transaction, input.requestId);
        if (
          current === null ||
          current.patient_principal_id !== input.patientPrincipalId ||
          current.status !== "ACTIVE" ||
          current.version !== input.expectedVersion
        ) {
          throw new LaboratoryConflictError("VERSION_CONFLICT");
        }
        await assertLaboratoryService(
          transaction,
          input.draft.laboratoryOrganizationId,
          current.service_id,
          input.draft.collectionMode === "HOME",
        );
        const active = await transaction.laboratoryBooking.findFirst({
          select: { id: true },
          where: { requestId: input.requestId, status: { not: "CANCELLED" } },
        });
        if (active !== null) throw new LaboratoryConflictError("ACTIVE_BOOKING_EXISTS");

        const now = new Date();
        const bookingId = createOpaqueId();
        await transaction.laboratoryBooking.create({
          data: {
            acceptedAt: now,
            bookingNumber: `LABBOOK-${createOpaqueId()}`,
            collectionMode: input.draft.collectionMode,
            ...(input.draft.homeCollection === undefined
              ? {}
              : {
                  homeCollection: {
                    create: {
                      ...input.draft.homeCollection,
                      id: createOpaqueId(),
                    },
                  },
                }),
            id: bookingId,
            laboratoryOrganizationId: input.draft.laboratoryOrganizationId,
            requestId: input.requestId,
            scheduledAt: input.draft.scheduledAt,
            statusHistory: {
              create: {
                actorPrincipalId: input.actorPrincipalId,
                id: createOpaqueId(),
                occurredAt: now,
                reasonCode: "patient_selected_laboratory",
                toStatus: "CONFIRMED",
              },
            },
            updatedAt: now,
          },
        });
        await transaction.auditEvent.create({
          data: {
            action: "laboratory.booking.created",
            actorPrincipalId: input.actorPrincipalId,
            id: createOpaqueId(),
            organizationId: input.draft.laboratoryOrganizationId,
            patientScopeId: current.patient_id,
            requestId: input.traceRequestId,
            resourceId: bookingId,
            resourceType: "laboratory_booking",
            result: "SUCCEEDED",
          },
        });
        const claimed = await transaction.laboratoryRequest.updateMany({
          data: { updatedAt: now, version: { increment: 1 } },
          where: { id: input.requestId, status: "ACTIVE", version: input.expectedVersion },
        });
        if (claimed.count !== 1) throw new LaboratoryConflictError("VERSION_CONFLICT");
        await transaction.idempotencyKey.update({
          data: {
            resourceId: input.requestId,
            resourceType: "laboratory_request",
            responseStatusCode: 201,
            status: "COMPLETED",
            updatedAt: now,
          },
          where: { id: idempotencyId },
        });
        return input.requestId;
      });
      return requestId === null ? null : this.findById(requestId);
    } catch (error) {
      if (isConstraintConflict(error)) throw new LaboratoryConflictError("ACTIVE_BOOKING_EXISTS");
      throw error;
    }
  }

  async transitionBooking(input: {
    actorPrincipalId: string;
    bookingId: string;
    expectedVersion: number;
    organizationId: string;
    reasonCode: string;
    requestId: string;
    toStatus: LaboratoryBookingStatus;
  }): Promise<LaboratoryRequestAccessRecord | null> {
    const requestId = await this.database.$transaction(async (transaction) => {
      const current = await transaction.laboratoryBooking.findFirst({
        select: { request: { select: { patientId: true } }, requestId: true, status: true },
        where: { id: input.bookingId, laboratoryOrganizationId: input.organizationId },
      });
      if (current === null || !canTransitionLaboratoryBooking(current.status, input.toStatus)) {
        throw new LaboratoryConflictError("INVALID_STATE");
      }
      const now = new Date();
      const updated = await transaction.laboratoryBooking.updateMany({
        data: {
          ...(input.toStatus === "SAMPLE_COLLECTED" ? { sampleCollectedAt: now } : {}),
          ...(input.toStatus === "PROCESSING" ? { processingStartedAt: now } : {}),
          ...(input.toStatus === "CANCELLED" ? { cancelledAt: now } : {}),
          status: input.toStatus,
          updatedAt: now,
          version: { increment: 1 },
        },
        where: {
          id: input.bookingId,
          laboratoryOrganizationId: input.organizationId,
          status: current.status,
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) throw new LaboratoryConflictError("VERSION_CONFLICT");
      await transaction.laboratoryBookingStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          bookingId: input.bookingId,
          fromStatus: current.status,
          id: createOpaqueId(),
          occurredAt: now,
          reasonCode: input.reasonCode,
          toStatus: input.toStatus,
        },
      });
      await transaction.auditEvent.create({
        data: {
          action: "laboratory.booking.transitioned",
          actorPrincipalId: input.actorPrincipalId,
          id: createOpaqueId(),
          metadata: { fromStatus: current.status, toStatus: input.toStatus },
          organizationId: input.organizationId,
          patientScopeId: current.request.patientId,
          reasonCode: input.reasonCode,
          requestId: input.requestId,
          resourceId: input.bookingId,
          resourceType: "laboratory_booking",
          result: "SUCCEEDED",
        },
      });
      return current.requestId;
    });
    return this.findById(requestId);
  }

  listByPatient(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId: string;
  }): Promise<LaboratoryRequestAccessList> {
    return this.listOwned({
      cursor: input.cursor,
      limit: input.limit,
      where: { patient: { principalId: input.patientPrincipalId } },
    });
  }

  listByPractitioner(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientId?: string;
    practitionerPrincipalId: string;
  }): Promise<LaboratoryRequestAccessList> {
    return this.listOwned({
      cursor: input.cursor,
      limit: input.limit,
      where: {
        ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
        practitioner: { principalId: input.practitionerPrincipalId },
      },
    });
  }

  async listLaboratoryQueue(input: {
    cursor?: { acceptedAt: Date; id: string };
    limit: number;
    organizationId: string;
    status?: LaboratoryBookingStatus;
  }): Promise<LaboratoryBookingListResponse> {
    const rows = await this.database.laboratoryBooking.findMany({
      include: {
        request: {
          include: {
            ...requestInclude,
            bookings: {
              ...requestInclude.bookings,
              where: { laboratoryOrganizationId: input.organizationId },
            },
          },
        },
      },
      orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      where: {
        laboratoryOrganizationId: input.organizationId,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { acceptedAt: { lt: input.cursor.acceptedAt } },
                { acceptedAt: input.cursor.acceptedAt, id: { lt: input.cursor.id } },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((row) =>
        laboratoryProjection(mapRequest(row.request), input.organizationId),
      ),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ acceptedAt: last.acceptedAt.toISOString(), id: last.id }),
                "utf8",
              ).toString("base64url"),
        hasNextPage,
      },
    };
  }

  private async listOwned(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    where: Prisma.LaboratoryRequestWhereInput;
  }) {
    const rows = await this.database.laboratoryRequest.findMany({
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...input.where,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map(mapRequest),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
                "utf8",
              ).toString("base64url"),
        hasNextPage,
      },
    };
  }
}

async function assertRequestReferences(
  transaction: Prisma.TransactionClient,
  draft: LaboratoryRequestDraft,
  practitionerId: string,
) {
  const [appointment, service] = await Promise.all([
    transaction.appointment.findFirst({
      select: { id: true },
      where: {
        id: draft.appointmentId,
        patientId: draft.patientId,
        practitionerId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
    }),
    transaction.serviceTaxonomy.findFirst({
      select: { id: true },
      where: { id: draft.serviceId, status: "ACTIVE" },
    }),
  ]);
  if (appointment === null || service === null) {
    throw new LaboratoryConflictError("INVARIANT_VIOLATION");
  }
}

async function assertLaboratoryService(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  serviceId: string,
  requiresHomeCollection: boolean,
) {
  const organization = await transaction.organization.findFirst({
    select: { id: true },
    where: {
      id: organizationId,
      organizationServices: {
        some: {
          serviceId,
          status: "ACTIVE",
          ...(requiresHomeCollection ? { supportsHomeCollection: true } : {}),
        },
      },
      status: "ACTIVE",
      type: "LABORATORY",
      verificationStatus: "VERIFIED",
    },
  });
  if (organization === null) throw new LaboratoryConflictError("INVARIANT_VIOLATION");
}

async function lockRequest(transaction: Prisma.TransactionClient, requestId: string) {
  const rows = await transaction.$queryRaw<
    {
      patient_principal_id: string;
      patient_id: string;
      service_id: string;
      status: "ACTIVE" | "CANCELLED" | "COMPLETED";
      version: number;
    }[]
  >(Prisma.sql`
    SELECT patient."principal_id" AS "patient_principal_id", request."patient_id",
           request."service_id",
           request."status", request."version"
      FROM "laboratory_requests" request
      JOIN "patients" patient ON patient."id" = request."patient_id"
     WHERE request."id" = ${requestId}::uuid
     FOR UPDATE
  `);
  return rows[0] ?? null;
}

function mapRequest(row: RequestRow): LaboratoryRequestAccessRecord {
  if (row.practitioner.principalId === null) {
    throw new LaboratoryConflictError("INVARIANT_VIOLATION");
  }
  const activeBooking = row.bookings.find((booking) => booking.status !== "CANCELLED");
  return {
    appointmentId: row.appointmentId,
    bookings: row.bookings.map((booking) => ({
      acceptedAt: booking.acceptedAt.toISOString(),
      bookingNumber: booking.bookingNumber,
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      collectionMode: booking.collectionMode,
      completedAt: booking.completedAt?.toISOString() ?? null,
      homeCollection:
        booking.homeCollection === null
          ? null
          : {
              addressLine1: booking.homeCollection.addressLine1,
              addressLine2: booking.homeCollection.addressLine2,
              administrativeArea: booking.homeCollection.administrativeArea,
              collectionInstructions: booking.homeCollection.collectionInstructions,
              countryCode: booking.homeCollection.countryCode,
              locality: booking.homeCollection.locality,
              postalCode: booking.homeCollection.postalCode,
            },
      id: booking.id,
      laboratory: {
        displayName: booking.laboratoryOrganization.displayName,
        id: booking.laboratoryOrganization.id,
      },
      processingStartedAt: booking.processingStartedAt?.toISOString() ?? null,
      resultReadyAt: booking.resultReadyAt?.toISOString() ?? null,
      sampleCollectedAt: booking.sampleCollectedAt?.toISOString() ?? null,
      scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      status: booking.status,
      statusHistory: booking.statusHistory
        .toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .map((entry) => ({
          fromStatus: entry.fromStatus,
          id: entry.id,
          occurredAt: entry.occurredAt.toISOString(),
          reasonCode: entry.reasonCode,
          toStatus: entry.toStatus,
        })),
      updatedAt: booking.updatedAt.toISOString(),
      version: booking.version,
    })),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    clinicalIndication: row.clinicalIndication,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    laboratoryOrganizationId: activeBooking?.laboratoryOrganizationId,
    orderedAt: row.orderedAt.toISOString(),
    patient: {
      displayName: `${row.patient.givenName} ${row.patient.familyName}`,
      id: row.patient.id,
    },
    patientPrincipalId: row.patient.principalId,
    practitioner: { displayName: row.practitioner.displayName, id: row.practitioner.id },
    practitionerPrincipalId: row.practitioner.principalId,
    priority: row.priority,
    requestNumber: row.requestNumber,
    service: row.service,
    specimenInstructions: row.specimenInstructions,
    status: row.status,
    statusHistory: row.statusHistory.map((entry) => ({
      fromStatus: entry.fromStatus,
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      reasonCode: entry.reasonCode,
      toStatus: entry.toStatus,
    })),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function publicRequest(request: LaboratoryRequestAccessRecord) {
  const {
    laboratoryOrganizationId: _laboratoryOrganizationId,
    patientPrincipalId: _patientPrincipalId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = request;
  return response;
}

function laboratoryProjection(request: LaboratoryRequestAccessRecord, organizationId: string) {
  const {
    appointmentId: _appointmentId,
    statusHistory: _history,
    ...response
  } = publicRequest(request);
  return {
    ...response,
    bookings: response.bookings.filter((booking) => booking.laboratory.id === organizationId),
  };
}

function requireLoaded(
  request: LaboratoryRequestAccessRecord | null,
): LaboratoryRequestAccessRecord {
  if (request === null) throw new LaboratoryConflictError("INVARIANT_VIOLATION");
  return request;
}

function isConstraintConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
