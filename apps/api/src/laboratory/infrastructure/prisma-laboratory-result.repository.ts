import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import { NOTIFICATION_TEMPLATE } from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { enqueueEmailNotification } from "../../notification/infrastructure/enqueue-notification.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import { canTransitionLaboratoryResult } from "../domain/laboratory-state-machine.js";
import {
  type LaboratoryCriticalResultAccessRecord,
  type LaboratoryResultAccessRecord,
  type LaboratoryResultComponentDraft,
  type LaboratoryResultDraft,
  type LaboratoryResultRepository,
} from "../domain/laboratory-result.types.js";
import { LaboratoryConflictError } from "../domain/laboratory.types.js";

const CREATE_RESULT_OPERATION = "laboratory.result.create";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

const resultInclude = {
  attachments: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  booking: {
    include: {
      request: { include: { service: { select: { code: true, id: true, name: true } } } },
    },
  },
  components: { orderBy: [{ lineNumber: "asc" as const }] },
  criticalResults: { orderBy: [{ acknowledgementDueAt: "asc" as const }, { id: "asc" as const }] },
  laboratoryOrganization: { select: { displayName: true, id: true } },
  patient: { select: { familyName: true, givenName: true, id: true, principalId: true } },
  practitioner: { select: { displayName: true, id: true, principalId: true } },
} satisfies Prisma.LaboratoryResultInclude;

type ResultRow = Prisma.LaboratoryResultGetPayload<{ include: typeof resultInclude }>;

@Injectable()
export class PrismaLaboratoryResultRepository implements LaboratoryResultRepository {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async findResultById(resultId: string): Promise<LaboratoryResultAccessRecord | null> {
    const row = await this.database.laboratoryResult.findUnique({
      include: resultInclude,
      relationLoadStrategy: "join",
      where: { id: resultId },
    });
    return row === null ? null : mapResult(row);
  }

  async createDraft(input: {
    actorPrincipalId: string;
    draft: LaboratoryResultDraft;
    idempotencyKey: string;
    organizationId: string;
    requestHash: string;
    requestId: string;
  }): Promise<LaboratoryResultAccessRecord> {
    const resultId = await this.database.$transaction(async (transaction) => {
      const existing = await transaction.idempotencyKey.findUnique({
        where: {
          principalId_operation_key: {
            key: input.idempotencyKey,
            operation: CREATE_RESULT_OPERATION,
            principalId: input.actorPrincipalId,
          },
        },
      });
      if (existing !== null) {
        if (existing.requestHash !== input.requestHash || existing.resourceId === null) {
          throw new LaboratoryConflictError("IDEMPOTENCY_CONFLICT");
        }
        return existing.resourceId;
      }

      const booking = await transaction.laboratoryBooking.findFirst({
        include: { request: { select: { patientId: true, practitionerId: true } } },
        where: {
          id: input.draft.bookingId,
          laboratoryOrganizationId: input.organizationId,
          status: "PROCESSING",
        },
      });
      if (booking === null) throw new LaboratoryConflictError("INVARIANT_VIOLATION");
      const now = new Date();
      const id = createOpaqueId();
      await transaction.idempotencyKey.create({
        data: {
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          id: createOpaqueId(),
          key: input.idempotencyKey,
          operation: CREATE_RESULT_OPERATION,
          principalId: input.actorPrincipalId,
          requestHash: input.requestHash,
          resourceId: id,
          resourceType: "laboratory_result",
          responseStatusCode: 201,
          status: "COMPLETED",
          updatedAt: now,
        },
      });
      await transaction.laboratoryResult.create({
        data: {
          bookingId: booking.id,
          components: { create: componentRows(input.draft.components) },
          createdByPrincipalId: input.actorPrincipalId,
          id,
          interpretation: input.draft.interpretation,
          laboratoryOrganizationId: input.organizationId,
          patientId: booking.request.patientId,
          practitionerId: booking.request.practitionerId,
          resultNumber: `LABRES-${createOpaqueId()}`,
          statusHistory: {
            create: {
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              occurredAt: now,
              reasonCode: "laboratory_result_drafted",
              toStatus: "DRAFT",
            },
          },
          summaryFlag: summaryFlag(input.draft.components),
          updatedAt: now,
        },
      });
      await appendAudit(transaction, {
        action: "laboratory.result.created",
        actorPrincipalId: input.actorPrincipalId,
        organizationId: input.organizationId,
        patientScopeId: booking.request.patientId,
        requestId: input.requestId,
        resourceId: id,
      });
      return id;
    });
    return requireResult(await this.findResultById(resultId));
  }

  async updateDraft(input: {
    actorPrincipalId: string;
    components: readonly LaboratoryResultComponentDraft[];
    expectedVersion: number;
    interpretation?: string;
    organizationId: string;
    requestId: string;
    resultId: string;
  }) {
    const updated = await this.database.$transaction(async (transaction) => {
      const claimed = await transaction.laboratoryResult.updateMany({
        data: {
          interpretation: input.interpretation,
          summaryFlag: summaryFlag(input.components),
          updatedAt: new Date(),
          version: { increment: 1 },
        },
        where: {
          id: input.resultId,
          laboratoryOrganizationId: input.organizationId,
          status: "DRAFT",
          version: input.expectedVersion,
        },
      });
      if (claimed.count !== 1) return false;
      await transaction.laboratoryResultComponent.deleteMany({
        where: { resultId: input.resultId },
      });
      await transaction.laboratoryResultComponent.createMany({
        data: componentRows(input.components).map((component) => ({
          ...component,
          resultId: input.resultId,
        })),
      });
      await appendAudit(transaction, {
        action: "laboratory.result.draft_updated",
        actorPrincipalId: input.actorPrincipalId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        resourceId: input.resultId,
      });
      return true;
    });
    return updated ? this.findResultById(input.resultId) : null;
  }

  async transitionResult(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    reasonCode: string;
    requestId: string;
    resultId: string;
    toStatus: "DRAFT" | "IN_REVIEW";
  }) {
    const resultId = await this.database.$transaction(async (transaction) => {
      const current = await transaction.laboratoryResult.findFirst({
        select: { id: true, status: true },
        where: { id: input.resultId, laboratoryOrganizationId: input.organizationId },
      });
      if (
        current === null ||
        !canTransitionLaboratoryResult(current.status, input.toStatus) ||
        !["DRAFT", "IN_REVIEW"].includes(current.status)
      ) {
        throw new LaboratoryConflictError("INVALID_STATE");
      }
      const now = new Date();
      const claimed = await transaction.laboratoryResult.updateMany({
        data: { status: input.toStatus, updatedAt: now, version: { increment: 1 } },
        where: { id: input.resultId, status: current.status, version: input.expectedVersion },
      });
      if (claimed.count !== 1) return null;
      await transaction.laboratoryResultStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          fromStatus: current.status,
          id: createOpaqueId(),
          occurredAt: now,
          reasonCode: input.reasonCode,
          resultId: input.resultId,
          toStatus: input.toStatus,
        },
      });
      await appendAudit(transaction, {
        action: "laboratory.result.review_transitioned",
        actorPrincipalId: input.actorPrincipalId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        resourceId: input.resultId,
      });
      return input.resultId;
    });
    return resultId === null ? null : this.findResultById(resultId);
  }

  async publish(input: {
    acknowledgementSeconds: number;
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    requestId: string;
    resultId: string;
  }) {
    const resultId = await this.database.$transaction(async (transaction) => {
      const current = await transaction.laboratoryResult.findFirst({
        include: {
          components: { orderBy: { lineNumber: "asc" } },
          patient: { select: { principalId: true } },
          practitioner: { select: { principalId: true } },
        },
        where: {
          id: input.resultId,
          laboratoryOrganizationId: input.organizationId,
          status: "IN_REVIEW",
        },
      });
      if (current === null || current.practitioner.principalId === null) {
        throw new LaboratoryConflictError("INVARIANT_VIOLATION");
      }
      const now = new Date();
      const digest = resultDigest(current.components, current.interpretation);
      if (current.previousResultId !== null) {
        const superseded = await transaction.laboratoryResult.updateMany({
          data: {
            status: "SUPERSEDED",
            supersededAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { id: current.previousResultId, status: "PUBLISHED" },
        });
        if (superseded.count !== 1) throw new LaboratoryConflictError("VERSION_CONFLICT");
        await transaction.laboratoryResultStatusHistory.create({
          data: {
            actorPrincipalId: input.actorPrincipalId,
            fromStatus: "PUBLISHED",
            id: createOpaqueId(),
            occurredAt: now,
            reasonCode: "published_result_amended",
            resultId: current.previousResultId,
            toStatus: "SUPERSEDED",
          },
        });
      }
      const claimed = await transaction.laboratoryResult.updateMany({
        data: {
          contentDigest: digest,
          publishedAt: now,
          publishedByPrincipalId: input.actorPrincipalId,
          status: "PUBLISHED",
          updatedAt: now,
          verifiedAt: now,
          verifiedByPrincipalId: input.actorPrincipalId,
          version: { increment: 1 },
        },
        where: { id: input.resultId, status: "IN_REVIEW", version: input.expectedVersion },
      });
      if (claimed.count !== 1) return null;
      await transaction.laboratoryResultStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          fromStatus: "IN_REVIEW",
          id: createOpaqueId(),
          occurredAt: now,
          reasonCode:
            current.previousResultId === null
              ? "result_verified_and_published"
              : "amendment_verified_and_published",
          resultId: input.resultId,
          toStatus: "PUBLISHED",
        },
      });
      if (current.previousResultId === null) {
        await completeBookingAndRequest(
          transaction,
          current.bookingId,
          input.actorPrincipalId,
          now,
        );
      }
      await enqueueEmailNotification(transaction, this.config, {
        deduplicationKey: `laboratory-result:${current.id}:patient-published`,
        recipientPrincipalId: current.patient.principalId,
        reference: current.resultNumber,
        resourceId: current.id,
        resourceType: "laboratory_result",
        templateKey: NOTIFICATION_TEMPLATE.LABORATORY_RESULT_PUBLISHED,
      });
      const criticalComponents = current.components.filter(
        (component) => component.flag === "CRITICAL",
      );
      for (const component of criticalComponents) {
        const criticalResultId = createOpaqueId();
        const notification = await enqueueEmailNotification(transaction, this.config, {
          deduplicationKey: `laboratory-critical:${criticalResultId}:initial`,
          recipientPrincipalId: current.practitioner.principalId,
          reference: current.resultNumber,
          resourceId: criticalResultId,
          resourceType: "laboratory_critical_result",
          templateKey: NOTIFICATION_TEMPLATE.LABORATORY_RESULT_ACTION_REQUIRED,
        });
        await transaction.laboratoryCriticalResult.create({
          data: {
            acknowledgementDueAt: new Date(now.getTime() + input.acknowledgementSeconds * 1000),
            componentId: component.id,
            id: criticalResultId,
            notifications: {
              create: {
                id: createOpaqueId(),
                ...(notification.deliveryId === null
                  ? {}
                  : { notificationDeliveryId: notification.deliveryId }),
                purpose: "INITIAL",
                recipientPrincipalId: current.practitioner.principalId,
                sequence: 1,
              },
            },
            ownerPrincipalId: current.practitioner.principalId,
            resultId: current.id,
            updatedAt: now,
          },
        });
      }
      if (criticalComponents.length === 0) {
        await enqueueEmailNotification(transaction, this.config, {
          deduplicationKey: `laboratory-result:${current.id}:practitioner-published`,
          recipientPrincipalId: current.practitioner.principalId,
          reference: current.resultNumber,
          resourceId: current.id,
          resourceType: "laboratory_result",
          templateKey: NOTIFICATION_TEMPLATE.LABORATORY_RESULT_PUBLISHED,
        });
      }
      await appendAudit(transaction, {
        action: "laboratory.result.published",
        actorPrincipalId: input.actorPrincipalId,
        organizationId: input.organizationId,
        patientScopeId: current.patientId,
        requestId: input.requestId,
        resourceId: current.id,
      });
      return current.id;
    });
    return resultId === null ? null : this.findResultById(resultId);
  }

  async createAmendment(input: {
    actorPrincipalId: string;
    components: readonly LaboratoryResultComponentDraft[];
    interpretation?: string;
    organizationId: string;
    previousResultId: string;
    requestId: string;
  }) {
    const id = await this.database.$transaction(async (transaction) => {
      const previous = await transaction.laboratoryResult.findFirst({
        select: {
          bookingId: true,
          laboratoryOrganizationId: true,
          patientId: true,
          practitionerId: true,
        },
        where: {
          id: input.previousResultId,
          laboratoryOrganizationId: input.organizationId,
          status: "PUBLISHED",
        },
      });
      if (previous === null) throw new LaboratoryConflictError("INVARIANT_VIOLATION");
      const now = new Date();
      const resultId = createOpaqueId();
      await transaction.laboratoryResult.create({
        data: {
          bookingId: previous.bookingId,
          components: { create: componentRows(input.components) },
          createdByPrincipalId: input.actorPrincipalId,
          id: resultId,
          interpretation: input.interpretation,
          laboratoryOrganizationId: previous.laboratoryOrganizationId,
          patientId: previous.patientId,
          practitionerId: previous.practitionerId,
          previousResultId: input.previousResultId,
          resultNumber: `LABRES-${createOpaqueId()}`,
          statusHistory: {
            create: {
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              occurredAt: now,
              reasonCode: "published_result_amendment_drafted",
              toStatus: "DRAFT",
            },
          },
          summaryFlag: summaryFlag(input.components),
          updatedAt: now,
        },
      });
      await appendAudit(transaction, {
        action: "laboratory.result.amendment_created",
        actorPrincipalId: input.actorPrincipalId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        resourceId: resultId,
      });
      return resultId;
    });
    return requireResult(await this.findResultById(id));
  }

  async listResults(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    organizationId?: string;
    patientPrincipalId?: string;
    practitionerPrincipalId?: string;
    status?: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "SUPERSEDED";
  }) {
    const rows = await this.database.laboratoryResult.findMany({
      include: resultInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...(input.organizationId === undefined
          ? {}
          : { laboratoryOrganizationId: input.organizationId }),
        ...(input.patientPrincipalId === undefined
          ? {}
          : { patient: { principalId: input.patientPrincipalId } }),
        ...(input.practitionerPrincipalId === undefined
          ? {}
          : { practitioner: { principalId: input.practitionerPrincipalId } }),
        ...(input.status === undefined ? {} : { status: input.status }),
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
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((row) => publicResult(mapResult(row))),
      pageInfo: {
        endCursor:
          last === undefined ? null : encodeCursor({ createdAt: last.createdAt, id: last.id }),
        hasNextPage: rows.length > input.limit,
      },
    };
  }

  async findCriticalById(criticalResultId: string) {
    const row = await this.database.laboratoryCriticalResult.findUnique({
      include: { ownerPrincipal: { select: { id: true } } },
      where: { id: criticalResultId },
    });
    return row === null ? null : mapCritical(row, row.ownerPrincipal.id);
  }

  async listCriticalByPractitioner(input: {
    cursor?: { acknowledgementDueAt: Date; id: string };
    limit: number;
    practitionerPrincipalId: string;
    status?: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";
  }) {
    const rows = await this.database.laboratoryCriticalResult.findMany({
      orderBy: [{ acknowledgementDueAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      where: {
        ownerPrincipalId: input.practitionerPrincipalId,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { acknowledgementDueAt: { lt: input.cursor.acknowledgementDueAt } },
                {
                  acknowledgementDueAt: input.cursor.acknowledgementDueAt,
                  id: { lt: input.cursor.id },
                },
              ],
            }),
      },
    });
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((row) => mapCritical(row, input.practitionerPrincipalId)),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : encodeCursor({ acknowledgementDueAt: last.acknowledgementDueAt, id: last.id }),
        hasNextPage: rows.length > input.limit,
      },
    };
  }

  acknowledgeCritical(input: {
    actorPrincipalId: string;
    criticalResultId: string;
    expectedVersion: number;
    requestId: string;
  }) {
    return this.transitionCritical({ ...input, status: "ACKNOWLEDGED" });
  }

  resolveCritical(input: {
    actorPrincipalId: string;
    criticalResultId: string;
    expectedVersion: number;
    requestId: string;
    resolutionCode: string;
  }) {
    return this.transitionCritical({ ...input, status: "RESOLVED" });
  }

  private async transitionCritical(input: {
    actorPrincipalId: string;
    criticalResultId: string;
    expectedVersion: number;
    requestId: string;
    resolutionCode?: string;
    status: "ACKNOWLEDGED" | "RESOLVED";
  }) {
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await transaction.laboratoryCriticalResult.findUnique({
        where: { id: input.criticalResultId },
      });
      if (current === null || current.ownerPrincipalId !== input.actorPrincipalId) return false;
      const allowed =
        input.status === "ACKNOWLEDGED" ? ["OPEN", "ESCALATED"] : ["ACKNOWLEDGED", "ESCALATED"];
      if (!allowed.includes(current.status)) throw new LaboratoryConflictError("INVALID_STATE");
      const now = new Date();
      const claimed = await transaction.laboratoryCriticalResult.updateMany({
        data:
          input.status === "ACKNOWLEDGED"
            ? {
                acknowledgedAt: now,
                acknowledgedByPrincipalId: input.actorPrincipalId,
                status: "ACKNOWLEDGED",
                updatedAt: now,
                version: { increment: 1 },
              }
            : {
                resolutionCode: input.resolutionCode,
                resolvedAt: now,
                resolvedByPrincipalId: input.actorPrincipalId,
                status: "RESOLVED",
                updatedAt: now,
                version: { increment: 1 },
              },
        where: {
          id: input.criticalResultId,
          status: current.status,
          version: input.expectedVersion,
        },
      });
      if (claimed.count !== 1) return false;
      await appendAudit(transaction, {
        action:
          input.status === "ACKNOWLEDGED"
            ? "laboratory.critical_result.acknowledged"
            : "laboratory.critical_result.resolved",
        actorPrincipalId: input.actorPrincipalId,
        requestId: input.requestId,
        resourceId: input.criticalResultId,
        resourceType: "laboratory_critical_result",
      });
      return true;
    });
    return updated ? this.findCriticalById(input.criticalResultId) : null;
  }
}

function componentRows(components: readonly LaboratoryResultComponentDraft[]) {
  return components.map((component, index) => ({
    ...(component.code === undefined ? {} : { code: component.code }),
    ...(component.codeSystem === undefined ? {} : { codeSystem: component.codeSystem }),
    flag: component.flag,
    id: createOpaqueId(),
    lineNumber: index + 1,
    name: component.name,
    ...(component.note === undefined ? {} : { note: component.note }),
    ...(component.referenceRange === undefined ? {} : { referenceRange: component.referenceRange }),
    ...(component.unit === undefined ? {} : { unit: component.unit }),
    value: component.value,
  }));
}

function summaryFlag(components: readonly LaboratoryResultComponentDraft[]) {
  const flags = components.map((component) => component.flag);
  if (flags.includes("CRITICAL")) return "CRITICAL" as const;
  if (flags.includes("HIGH")) return "HIGH" as const;
  if (flags.includes("LOW")) return "LOW" as const;
  if (flags.includes("ABNORMAL")) return "ABNORMAL" as const;
  return "NORMAL" as const;
}

function resultDigest(
  components: readonly {
    code: string | null;
    codeSystem: string | null;
    flag: string;
    lineNumber: number;
    name: string;
    note: string | null;
    referenceRange: string | null;
    unit: string | null;
    value: string;
  }[],
  interpretation: string | null,
) {
  const canonicalComponents = components.map((component) => ({
    code: component.code,
    codeSystem: component.codeSystem,
    flag: component.flag,
    lineNumber: component.lineNumber,
    name: component.name,
    note: component.note,
    referenceRange: component.referenceRange,
    unit: component.unit,
    value: component.value,
  }));
  return createHash("sha256")
    .update(JSON.stringify({ components: canonicalComponents, interpretation }))
    .digest("hex");
}

async function completeBookingAndRequest(
  transaction: Prisma.TransactionClient,
  bookingId: string,
  actorPrincipalId: string,
  now: Date,
) {
  const booking = await transaction.laboratoryBooking.findUnique({
    select: { requestId: true, status: true },
    where: { id: bookingId },
  });
  if (booking === null || booking.status !== "PROCESSING")
    throw new LaboratoryConflictError("INVALID_STATE");
  for (const transition of [
    { from: "PROCESSING" as const, reason: "result_published", to: "RESULT_READY" as const },
    { from: "RESULT_READY" as const, reason: "result_released", to: "COMPLETED" as const },
  ]) {
    const changed = await transaction.laboratoryBooking.updateMany({
      data: {
        ...(transition.to === "RESULT_READY" ? { resultReadyAt: now } : { completedAt: now }),
        status: transition.to,
        updatedAt: now,
        version: { increment: 1 },
      },
      where: { id: bookingId, status: transition.from },
    });
    if (changed.count !== 1) throw new LaboratoryConflictError("VERSION_CONFLICT");
    await transaction.laboratoryBookingStatusHistory.create({
      data: {
        actorPrincipalId,
        bookingId,
        fromStatus: transition.from,
        id: createOpaqueId(),
        occurredAt: now,
        reasonCode: transition.reason,
        toStatus: transition.to,
      },
    });
  }
  const request = await transaction.laboratoryRequest.findUnique({
    select: { status: true, version: true },
    where: { id: booking.requestId },
  });
  if (request?.status !== "ACTIVE") throw new LaboratoryConflictError("INVALID_STATE");
  const requestChanged = await transaction.laboratoryRequest.updateMany({
    data: { completedAt: now, status: "COMPLETED", updatedAt: now, version: { increment: 1 } },
    where: { id: booking.requestId, status: "ACTIVE", version: request.version },
  });
  if (requestChanged.count !== 1) throw new LaboratoryConflictError("VERSION_CONFLICT");
  await transaction.laboratoryRequestStatusHistory.create({
    data: {
      actorPrincipalId,
      fromStatus: "ACTIVE",
      id: createOpaqueId(),
      occurredAt: now,
      reasonCode: "result_published",
      requestId: booking.requestId,
      toStatus: "COMPLETED",
    },
  });
}

async function appendAudit(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    actorPrincipalId: string;
    organizationId?: string;
    patientScopeId?: string;
    requestId: string;
    resourceId: string;
    resourceType?: string;
  },
) {
  await transaction.auditEvent.create({
    data: {
      action: input.action,
      actorPrincipalId: input.actorPrincipalId,
      id: createOpaqueId(),
      organizationId: input.organizationId,
      patientScopeId: input.patientScopeId,
      requestId: input.requestId,
      resourceId: input.resourceId,
      resourceType: input.resourceType ?? "laboratory_result",
      result: "SUCCEEDED",
    },
  });
}

function mapResult(row: ResultRow): LaboratoryResultAccessRecord {
  if (row.practitioner.principalId === null)
    throw new LaboratoryConflictError("INVARIANT_VIOLATION");
  return {
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      originalFilename: attachment.originalFilename,
      purpose: attachment.purpose,
      status: attachment.status,
    })),
    bookingId: row.bookingId,
    components: row.components.map((component) => ({
      code: component.code,
      codeSystem: component.codeSystem,
      flag: component.flag,
      id: component.id,
      lineNumber: component.lineNumber,
      name: component.name,
      note: component.note,
      referenceRange: component.referenceRange,
      unit: component.unit,
      value: component.value,
    })),
    createdAt: row.createdAt.toISOString(),
    criticalResults: row.criticalResults.map((critical) =>
      mapCritical(critical, row.practitioner.principalId!),
    ),
    id: row.id,
    interpretation: row.interpretation,
    laboratory: {
      displayName: row.laboratoryOrganization.displayName,
      id: row.laboratoryOrganization.id,
    },
    laboratoryOrganizationId: row.laboratoryOrganizationId,
    patient: {
      displayName: `${row.patient.givenName} ${row.patient.familyName}`,
      id: row.patient.id,
    },
    patientPrincipalId: row.patient.principalId,
    practitioner: { displayName: row.practitioner.displayName, id: row.practitioner.id },
    practitionerPrincipalId: row.practitioner.principalId,
    previousResultId: row.previousResultId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    resultNumber: row.resultNumber,
    service: row.booking.request.service,
    status: row.status,
    summaryFlag: row.summaryFlag,
    updatedAt: row.updatedAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    version: row.version,
  };
}

function mapCritical(
  row: {
    acknowledgementDueAt: Date;
    acknowledgedAt: Date | null;
    componentId: string;
    escalatedAt: Date | null;
    id: string;
    resolutionCode: string | null;
    resolvedAt: Date | null;
    resultId: string;
    status: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";
    version: number;
  },
  practitionerPrincipalId: string,
): LaboratoryCriticalResultAccessRecord {
  return {
    acknowledgementDueAt: row.acknowledgementDueAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    componentId: row.componentId,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    id: row.id,
    practitionerPrincipalId,
    resolutionCode: row.resolutionCode,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resultId: row.resultId,
    status: row.status,
    version: row.version,
  };
}

function publicResult(result: LaboratoryResultAccessRecord) {
  const {
    laboratoryOrganizationId: _organizationId,
    patientPrincipalId: _patientPrincipalId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = result;
  return response;
}

function requireResult(result: LaboratoryResultAccessRecord | null) {
  if (result === null) throw new LaboratoryConflictError("INVARIANT_VIOLATION");
  return result;
}

function encodeCursor(value: Record<string, Date | string>) {
  return Buffer.from(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          item instanceof Date ? item.toISOString() : item,
        ]),
      ),
    ),
    "utf8",
  ).toString("base64url");
}
