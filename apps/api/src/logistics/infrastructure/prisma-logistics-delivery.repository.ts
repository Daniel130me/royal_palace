import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import { NOTIFICATION_TEMPLATE } from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import {
  enqueueEmailNotification,
  enqueueOrganizationInboxNotification,
} from "../../notification/infrastructure/enqueue-notification.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import { canTransitionLogisticsDelivery } from "../domain/logistics-delivery-state-machine.js";
import {
  LogisticsConflictError,
  type AssignCourierInput,
  type DispatchLogisticsDeliveryInput,
  type LogisticsDeliveryRecord,
  type LogisticsDeliveryRepository,
  type LogisticsHistoryRecord,
  type LogisticsListInput,
  type LogisticsRequestContext,
  type ReassignLogisticsDeliveryInput,
  type TransitionLogisticsDeliveryInput,
  type VerifyRecipientCodeInput,
  type VerifyRecipientCodeResult,
} from "../domain/logistics-delivery.types.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const DISPATCH_OPERATION = "DISPATCH_LOGISTICS_DELIVERY";
const REASSIGN_OPERATION = "REASSIGN_LOGISTICS_DELIVERY";
const ASSIGN_COURIER_OPERATION = "ASSIGN_LOGISTICS_COURIER";
const TRANSITION_OPERATION = "TRANSITION_LOGISTICS_DELIVERY";
const CANCEL_OPERATION = "CANCEL_LOGISTICS_DELIVERY";
const VERIFY_RECIPIENT_CODE_OPERATION = "VERIFY_LOGISTICS_RECIPIENT_CODE";

const deliveryInclude = {
  assignments: {
    orderBy: [{ assignedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    where: { status: "ACTIVE" as const },
  },
  handoff: { select: { handoffReference: true } },
  order: {
    select: {
      orderNumber: true,
      patient: { select: { principalId: true } },
      pharmacyOrganizationId: true,
    },
  },
} satisfies Prisma.LogisticsDeliveryInclude;

type DeliveryRow = Prisma.LogisticsDeliveryGetPayload<{ include: typeof deliveryInclude }>;
type Transaction = Prisma.TransactionClient;
type InternalStatusChangeInput = Omit<TransitionLogisticsDeliveryInput, "toStatus"> & {
  toStatus: TransitionLogisticsDeliveryInput["toStatus"] | "CANCELLED";
};

@Injectable()
export class PrismaLogisticsDeliveryRepository implements LogisticsDeliveryRepository {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async dispatch(
    context: LogisticsRequestContext,
    input: DispatchLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord> {
    const deliveryId = await this.database.$transaction(async (transaction) => {
      const replay = await claimIdempotency(transaction, {
        actorPrincipalId: context.actorPrincipalId,
        key: input.idempotencyKey,
        operation: DISPATCH_OPERATION,
        requestHash: input.requestHash,
      });
      if (replay !== null) return replay.resourceId;

      const handoff = await transaction.pharmacyOrderHandoff.findUnique({
        select: {
          id: true,
          method: true,
          order: {
            select: {
              id: true,
              patient: { select: { principalId: true } },
              status: true,
            },
          },
          status: true,
        },
        where: { id: input.handoffId },
      });
      if (
        handoff === null ||
        handoff.method !== "DELIVERY" ||
        handoff.status !== "READY" ||
        handoff.order.status !== "CONFIRMED"
      ) {
        throw new LogisticsConflictError("HANDOFF_NOT_DISPATCHABLE");
      }

      const now = new Date();
      const id = createOpaqueId();
      const deliveryNumber = `DLV-${id}`;
      const recipientCode = randomInt(0, 100_000_000).toString().padStart(8, "0");
      const recipientCodeKey =
        this.config.logisticsRecipientCode.keys[this.config.logisticsRecipientCode.activeKeyId];
      if (recipientCodeKey === undefined) {
        throw new LogisticsConflictError("RECIPIENT_CODE_KEY_UNAVAILABLE");
      }
      await transaction.logisticsDelivery.create({
        data: {
          assignedAt: now,
          deliveryAddressLine1: input.deliveryAddress.addressLine1,
          ...(input.deliveryAddress.addressLine2 === undefined
            ? {}
            : { deliveryAddressLine2: input.deliveryAddress.addressLine2 }),
          deliveryAdministrativeArea: input.deliveryAddress.administrativeArea,
          deliveryCountryCode: input.deliveryAddress.countryCode,
          ...(input.deliveryInstruction === undefined
            ? {}
            : { deliveryInstruction: input.deliveryInstruction }),
          deliveryLocality: input.deliveryAddress.locality,
          deliveryNumber,
          ...(input.deliveryAddress.postalCode === undefined
            ? {}
            : { deliveryPostalCode: input.deliveryAddress.postalCode }),
          handoffId: handoff.id,
          id,
          logisticsOrganizationId: input.logisticsOrganizationId,
          orderId: handoff.order.id,
          pickupAddressLine1: input.pickupAddress.addressLine1,
          ...(input.pickupAddress.addressLine2 === undefined
            ? {}
            : { pickupAddressLine2: input.pickupAddress.addressLine2 }),
          pickupAdministrativeArea: input.pickupAddress.administrativeArea,
          pickupContactName: input.pickupContactName,
          pickupContactPhoneE164: input.pickupContactPhoneE164,
          pickupCountryCode: input.pickupAddress.countryCode,
          pickupLocality: input.pickupAddress.locality,
          pickupLocationName: input.pickupLocationName,
          ...(input.pickupAddress.postalCode === undefined
            ? {}
            : { pickupPostalCode: input.pickupAddress.postalCode }),
          recipientCodeDigest: createHmac("sha256", Buffer.from(recipientCodeKey, "base64"))
            .update(`${id}:${recipientCode}`)
            .digest("hex"),
          recipientCodeExpiresAt: new Date(
            now.getTime() + this.config.logisticsRecipientCode.ttlSeconds * 1_000,
          ),
          recipientCodeKeyId: this.config.logisticsRecipientCode.activeKeyId,
          recipientName: input.recipientName,
          recipientPhoneE164: input.recipientPhoneE164,
        },
      });
      await transaction.logisticsRecipientCodeChallenge.create({
        data: { deliveryId: id },
      });
      await transaction.logisticsDeliveryAssignment.create({
        data: {
          assignedAt: now,
          assignedByPrincipalId: context.actorPrincipalId,
          ...(input.courierPrincipalId === undefined
            ? {}
            : { courierPrincipalId: input.courierPrincipalId }),
          deliveryId: id,
          id: createOpaqueId(),
          logisticsOrganizationId: input.logisticsOrganizationId,
        },
      });
      await transaction.logisticsDeliveryStatusHistory.create({
        data: {
          actorPrincipalId: context.actorPrincipalId,
          deliveryId: id,
          id: createOpaqueId(),
          idempotencyKey: historyKey(DISPATCH_OPERATION, context, input.idempotencyKey),
          occurredAt: now,
          reasonCode: "ADMIN_DISPATCHED",
          toStatus: "ASSIGNED",
        },
      });
      await enqueueEmailNotification(transaction, this.config, {
        deduplicationKey: `logistics-recipient-code:${id}`,
        recipientPrincipalId: handoff.order.patient.principalId,
        reference: `${deliveryNumber}-${recipientCode}`,
        resourceId: id,
        resourceType: "logistics_delivery",
        templateKey: NOTIFICATION_TEMPLATE.LOGISTICS_RECIPIENT_CODE,
      });
      await appendAudit(transaction, context, "logistics.delivery.dispatched", id, {
        organizationId: input.logisticsOrganizationId,
      });
      await completeIdempotency(
        transaction,
        context.actorPrincipalId,
        DISPATCH_OPERATION,
        input,
        id,
        201,
      );
      return id;
    });
    return requireDelivery(await this.findById(deliveryId));
  }

  async reassign(
    context: LogisticsRequestContext,
    input: ReassignLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord | null> {
    const deliveryId = await this.database.$transaction(async (transaction) => {
      const replay = await claimIdempotency(transaction, {
        actorPrincipalId: context.actorPrincipalId,
        key: input.idempotencyKey,
        operation: REASSIGN_OPERATION,
        requestHash: input.requestHash,
      });
      if (replay !== null) return replay.resourceId;

      const current = await lockDelivery(transaction, input.deliveryId);
      if (
        current === null ||
        current.status !== "ASSIGNED" ||
        current.version !== input.expectedVersion
      ) {
        throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      }
      const now = new Date();
      const released = await transaction.logisticsDeliveryAssignment.updateMany({
        data: {
          releaseReasonCode: input.reasonCode,
          releasedAt: now,
          status: "RELEASED",
          version: { increment: 1 },
        },
        where: { deliveryId: input.deliveryId, status: "ACTIVE" },
      });
      if (released.count !== 1) throw new LogisticsConflictError("ACTIVE_ASSIGNMENT_MISSING");
      const updated = await transaction.logisticsDelivery.updateMany({
        data: {
          logisticsOrganizationId: input.logisticsOrganizationId,
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: input.deliveryId, status: "ASSIGNED", version: input.expectedVersion },
      });
      if (updated.count !== 1) throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      await transaction.logisticsDeliveryAssignment.create({
        data: {
          assignedAt: now,
          assignedByPrincipalId: context.actorPrincipalId,
          ...(input.courierPrincipalId === undefined
            ? {}
            : { courierPrincipalId: input.courierPrincipalId }),
          deliveryId: input.deliveryId,
          id: createOpaqueId(),
          logisticsOrganizationId: input.logisticsOrganizationId,
        },
      });
      await appendAudit(transaction, context, "logistics.delivery.reassigned", input.deliveryId, {
        organizationId: input.logisticsOrganizationId,
      });
      await completeIdempotency(
        transaction,
        context.actorPrincipalId,
        REASSIGN_OPERATION,
        input,
        input.deliveryId,
      );
      return input.deliveryId;
    });
    return this.findById(deliveryId);
  }

  async assignCourier(
    context: LogisticsRequestContext,
    input: AssignCourierInput,
  ): Promise<LogisticsDeliveryRecord | null> {
    const deliveryId = await this.database.$transaction(async (transaction) => {
      const replay = await claimIdempotency(transaction, {
        actorPrincipalId: context.actorPrincipalId,
        key: input.idempotencyKey,
        operation: ASSIGN_COURIER_OPERATION,
        requestHash: input.requestHash,
      });
      if (replay !== null) return replay.resourceId;
      const current = await transaction.logisticsDeliveryAssignment.findFirst({
        select: {
          delivery: { select: { status: true } },
          id: true,
          logisticsOrganizationId: true,
          version: true,
        },
        where: { deliveryId: input.deliveryId, status: "ACTIVE" },
      });
      if (
        current === null ||
        current.delivery.status !== "ASSIGNED" ||
        current.version !== input.expectedAssignmentVersion
      ) {
        throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      }
      const now = new Date();
      const released = await transaction.logisticsDeliveryAssignment.updateMany({
        data: {
          releaseReasonCode: "COURIER_ASSIGNED",
          releasedAt: now,
          status: "RELEASED",
          version: { increment: 1 },
        },
        where: { id: current.id, status: "ACTIVE", version: input.expectedAssignmentVersion },
      });
      if (released.count !== 1) throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      await transaction.logisticsDeliveryAssignment.create({
        data: {
          assignedAt: now,
          assignedByPrincipalId: context.actorPrincipalId,
          courierPrincipalId: input.courierPrincipalId,
          deliveryId: input.deliveryId,
          id: createOpaqueId(),
          logisticsOrganizationId: current.logisticsOrganizationId,
        },
      });
      await appendAudit(transaction, context, "logistics.courier.assigned", input.deliveryId);
      await completeIdempotency(
        transaction,
        context.actorPrincipalId,
        ASSIGN_COURIER_OPERATION,
        input,
        input.deliveryId,
      );
      return input.deliveryId;
    });
    return this.findById(deliveryId);
  }

  async transition(
    context: LogisticsRequestContext,
    input: TransitionLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord | null> {
    return this.changeStatus(context, input, TRANSITION_OPERATION, true);
  }

  async cancel(
    context: LogisticsRequestContext,
    input: Omit<TransitionLogisticsDeliveryInput, "toStatus">,
  ): Promise<LogisticsDeliveryRecord | null> {
    return this.changeStatus(context, { ...input, toStatus: "CANCELLED" }, CANCEL_OPERATION, false);
  }

  private async changeStatus(
    context: LogisticsRequestContext,
    input: InternalStatusChangeInput,
    operation: string,
    courierRequired: boolean,
  ): Promise<LogisticsDeliveryRecord | null> {
    const deliveryId = await this.database.$transaction(async (transaction) => {
      const replay = await claimIdempotency(transaction, {
        actorPrincipalId: context.actorPrincipalId,
        key: input.idempotencyKey,
        operation,
        requestHash: input.requestHash,
      });
      if (replay !== null) return replay.resourceId;
      const current = await transaction.logisticsDelivery.findUnique({
        select: {
          assignments: {
            select: { courierPrincipalId: true },
            take: 1,
            where: { status: "ACTIVE" },
          },
          deliveryNumber: true,
          order: {
            select: {
              patient: { select: { principalId: true } },
              pharmacyOrganizationId: true,
            },
          },
          status: true,
          version: true,
        },
        where: { id: input.deliveryId },
      });
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        !canTransitionLogisticsDelivery(current.status, input.toStatus)
      ) {
        throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      }
      if (
        courierRequired &&
        current.assignments[0]?.courierPrincipalId !== context.actorPrincipalId
      ) {
        throw new LogisticsConflictError("ASSIGNED_COURIER_REQUIRED");
      }
      const now = new Date();
      const updated = await transaction.logisticsDelivery.updateMany({
        data: {
          ...(input.toStatus === "ACCEPTED" ? { acceptedAt: now } : {}),
          ...(input.toStatus === "ARRIVED_AT_PICKUP" ? { arrivedAtPickupAt: now } : {}),
          ...(input.toStatus === "PICKUP_VERIFIED" ? { pickupVerifiedAt: now } : {}),
          ...(input.toStatus === "PICKED_UP" ? { pickedUpAt: now } : {}),
          ...(input.toStatus === "ARRIVED_AT_DESTINATION" ? { arrivedAtDestinationAt: now } : {}),
          ...(input.toStatus === "FAILED" ? { failedAt: now } : {}),
          ...(input.toStatus === "RETURNED" ? { returnedAt: now } : {}),
          ...(input.toStatus === "CANCELLED" ? { cancelledAt: now } : {}),
          status: input.toStatus,
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: input.deliveryId, status: current.status, version: input.expectedVersion },
      });
      if (updated.count !== 1) throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      await transaction.logisticsDeliveryStatusHistory.create({
        data: {
          actorPrincipalId: context.actorPrincipalId,
          deliveryId: input.deliveryId,
          fromStatus: current.status,
          id: createOpaqueId(),
          idempotencyKey: historyKey(operation, context, input.idempotencyKey),
          occurredAt: now,
          ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
          toStatus: input.toStatus,
        },
      });
      await enqueueStatusNotifications(transaction, this.config, {
        deliveryId: input.deliveryId,
        deliveryNumber: current.deliveryNumber,
        patientPrincipalId: current.order.patient.principalId,
        pharmacyOrganizationId: current.order.pharmacyOrganizationId,
        status: input.toStatus,
      });
      await appendAudit(
        transaction,
        context,
        "logistics.delivery.status_changed",
        input.deliveryId,
      );
      await completeIdempotency(
        transaction,
        context.actorPrincipalId,
        operation,
        input,
        input.deliveryId,
      );
      return input.deliveryId;
    });
    return this.findById(deliveryId);
  }

  async verifyRecipientCode(
    context: LogisticsRequestContext,
    input: VerifyRecipientCodeInput,
  ): Promise<VerifyRecipientCodeResult> {
    const result = await this.database.$transaction(async (transaction) => {
      const replay = await claimIdempotency(transaction, {
        actorPrincipalId: context.actorPrincipalId,
        key: input.idempotencyKey,
        operation: VERIFY_RECIPIENT_CODE_OPERATION,
        requestHash: input.requestHash,
      });
      if (replay !== null) {
        return { deliveryId: replay.resourceId, outcome: proofOutcome(replay.responseStatusCode) };
      }

      const current = await lockDeliveryForProof(transaction, input.deliveryId);
      if (
        current === null ||
        current.status !== "ARRIVED_AT_DESTINATION" ||
        current.version !== input.expectedVersion
      ) {
        throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      }
      const assignment = await transaction.logisticsDeliveryAssignment.findFirst({
        select: { courierPrincipalId: true },
        where: { deliveryId: input.deliveryId, status: "ACTIVE" },
      });
      if (assignment?.courierPrincipalId !== context.actorPrincipalId) {
        throw new LogisticsConflictError("ASSIGNED_COURIER_REQUIRED");
      }
      const challenge = await transaction.logisticsRecipientCodeChallenge.findUnique({
        where: { deliveryId: input.deliveryId },
      });
      if (challenge === null || challenge.verifiedAt !== null) {
        throw new LogisticsConflictError("RECIPIENT_CODE_CHALLENGE_UNAVAILABLE");
      }

      const now = new Date();
      if (current.recipientCodeExpiresAt <= now) {
        await recordRejectedProofAttempt(transaction, context, input, "CODE_EXPIRED", 410);
        return { deliveryId: input.deliveryId, outcome: "CODE_EXPIRED" as const };
      }
      if (challenge.lockedUntil !== null && challenge.lockedUntil > now) {
        await recordRejectedProofAttempt(transaction, context, input, "RATE_LIMITED", 429);
        return { deliveryId: input.deliveryId, outcome: "RATE_LIMITED" as const };
      }

      const recipientCodeKey = this.config.logisticsRecipientCode.keys[current.recipientCodeKeyId];
      if (recipientCodeKey === undefined) {
        throw new LogisticsConflictError("RECIPIENT_CODE_KEY_UNAVAILABLE");
      }
      const suppliedDigest = createHmac("sha256", Buffer.from(recipientCodeKey, "base64"))
        .update(`${input.deliveryId}:${input.recipientCode}`)
        .digest();
      const expectedDigest = Buffer.from(current.recipientCodeDigest, "hex");
      const valid =
        suppliedDigest.length === expectedDigest.length &&
        timingSafeEqual(suppliedDigest, expectedDigest);
      if (!valid) {
        const windowExpired =
          challenge.attemptWindowStartedAt === null ||
          now.getTime() - challenge.attemptWindowStartedAt.getTime() >=
            this.config.logisticsRecipientCode.attemptWindowSeconds * 1_000;
        const failedAttempts = windowExpired ? 1 : challenge.failedAttempts + 1;
        const limited = failedAttempts >= this.config.logisticsRecipientCode.maxAttempts;
        const updated = await transaction.logisticsRecipientCodeChallenge.updateMany({
          data: {
            attemptWindowStartedAt: windowExpired ? now : challenge.attemptWindowStartedAt,
            failedAttempts,
            lockedUntil: limited
              ? new Date(now.getTime() + this.config.logisticsRecipientCode.lockSeconds * 1_000)
              : null,
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { deliveryId: input.deliveryId, verifiedAt: null, version: challenge.version },
        });
        if (updated.count !== 1) throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
        const outcome = limited ? "RATE_LIMITED" : "INVALID_CODE";
        await recordRejectedProofAttempt(transaction, context, input, outcome, limited ? 429 : 422);
        return { deliveryId: input.deliveryId, outcome } as const;
      }

      const challengeUpdated = await transaction.logisticsRecipientCodeChallenge.updateMany({
        data: { lockedUntil: null, updatedAt: now, verifiedAt: now, version: { increment: 1 } },
        where: { deliveryId: input.deliveryId, verifiedAt: null, version: challenge.version },
      });
      if (challengeUpdated.count !== 1) {
        throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      }
      await transaction.logisticsDeliveryProof.create({
        data: {
          deliveryId: input.deliveryId,
          id: createOpaqueId(),
          method: "RECIPIENT_CODE",
          recordedByPrincipalId: context.actorPrincipalId,
          verifiedAt: now,
        },
      });
      const delivered = await transaction.logisticsDelivery.updateMany({
        data: { deliveredAt: now, status: "DELIVERED", updatedAt: now, version: { increment: 1 } },
        where: {
          id: input.deliveryId,
          status: "ARRIVED_AT_DESTINATION",
          version: input.expectedVersion,
        },
      });
      if (delivered.count !== 1) throw new LogisticsConflictError("VERSION_OR_STATE_CONFLICT");
      await transaction.logisticsDeliveryStatusHistory.create({
        data: {
          actorPrincipalId: context.actorPrincipalId,
          deliveryId: input.deliveryId,
          fromStatus: "ARRIVED_AT_DESTINATION",
          id: createOpaqueId(),
          idempotencyKey: historyKey(
            VERIFY_RECIPIENT_CODE_OPERATION,
            context,
            input.idempotencyKey,
          ),
          occurredAt: now,
          reasonCode: "RECIPIENT_CODE_VERIFIED",
          toStatus: "DELIVERED",
        },
      });
      await enqueueStatusNotifications(transaction, this.config, {
        deliveryId: input.deliveryId,
        deliveryNumber: current.deliveryNumber,
        patientPrincipalId: current.patientPrincipalId,
        pharmacyOrganizationId: current.pharmacyOrganizationId,
        status: "DELIVERED",
      });
      await appendAudit(
        transaction,
        context,
        "logistics.delivery.proof_verified",
        input.deliveryId,
      );
      await completeIdempotency(
        transaction,
        context.actorPrincipalId,
        VERIFY_RECIPIENT_CODE_OPERATION,
        input,
        input.deliveryId,
      );
      return { deliveryId: input.deliveryId, outcome: "DELIVERED" as const };
    });
    if (result.outcome !== "DELIVERED") return { outcome: result.outcome };
    return {
      delivery: requireDelivery(await this.findById(result.deliveryId)),
      outcome: "DELIVERED",
    };
  }

  async findById(id: string): Promise<LogisticsDeliveryRecord | null> {
    const row = await this.database.logisticsDelivery.findUnique({
      include: deliveryInclude,
      where: { id },
    });
    return row === null ? null : mapDelivery(row);
  }

  async listAdmin(input: LogisticsListInput): Promise<LogisticsDeliveryRecord[]> {
    return this.list(input, {});
  }

  async listByLogisticsOrganization(
    organizationId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]> {
    return this.list(input, { logisticsOrganizationId: organizationId });
  }

  async listByPatient(
    patientPrincipalId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]> {
    return this.list(input, { order: { patient: { principalId: patientPrincipalId } } });
  }

  async listByPharmacy(
    pharmacyOrganizationId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]> {
    return this.list(input, { order: { pharmacyOrganizationId } });
  }

  private async list(
    input: LogisticsListInput,
    scope: Prisma.LogisticsDeliveryWhereInput,
  ): Promise<LogisticsDeliveryRecord[]> {
    const rows = await this.database.logisticsDelivery.findMany({
      include: deliveryInclude,
      orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
      take: input.limit,
      where: {
        ...scope,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { assignedAt: { lt: input.cursor.assignedAt } },
                { assignedAt: input.cursor.assignedAt, id: { lt: input.cursor.id } },
              ],
            }),
      },
    });
    return rows.map(mapDelivery);
  }

  async listHistory(deliveryId: string, limit: number): Promise<LogisticsHistoryRecord[]> {
    return this.database.logisticsDeliveryStatusHistory.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        actorPrincipalId: true,
        fromStatus: true,
        id: true,
        occurredAt: true,
        reasonCode: true,
        toStatus: true,
      },
      take: limit,
      where: { deliveryId },
    });
  }
}

async function claimIdempotency(
  transaction: Transaction,
  input: { actorPrincipalId: string; key: string; operation: string; requestHash: string },
): Promise<{ resourceId: string; responseStatusCode: number } | null> {
  const existing = await transaction.idempotencyKey.findUnique({
    where: {
      principalId_operation_key: {
        key: input.key,
        operation: input.operation,
        principalId: input.actorPrincipalId,
      },
    },
  });
  if (existing !== null) {
    if (
      existing.requestHash !== input.requestHash ||
      existing.status !== "COMPLETED" ||
      existing.resourceId === null
    ) {
      throw new LogisticsConflictError("IDEMPOTENCY_CONFLICT");
    }
    return {
      resourceId: existing.resourceId,
      responseStatusCode: existing.responseStatusCode ?? 200,
    };
  }
  await transaction.idempotencyKey.create({
    data: {
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      id: createOpaqueId(),
      key: input.key,
      operation: input.operation,
      principalId: input.actorPrincipalId,
      requestHash: input.requestHash,
      updatedAt: new Date(),
    },
  });
  return null;
}

function proofOutcome(
  responseStatusCode: number,
): "CODE_EXPIRED" | "DELIVERED" | "INVALID_CODE" | "RATE_LIMITED" {
  if (responseStatusCode === 200) return "DELIVERED";
  if (responseStatusCode === 410) return "CODE_EXPIRED";
  if (responseStatusCode === 429) return "RATE_LIMITED";
  if (responseStatusCode === 422) return "INVALID_CODE";
  throw new LogisticsConflictError("IDEMPOTENCY_CONFLICT");
}

async function recordRejectedProofAttempt(
  transaction: Transaction,
  context: LogisticsRequestContext,
  input: VerifyRecipientCodeInput,
  reasonCode: "CODE_EXPIRED" | "INVALID_CODE" | "RATE_LIMITED",
  responseStatusCode: number,
): Promise<void> {
  await appendAudit(transaction, context, "logistics.delivery.proof_rejected", input.deliveryId, {
    reasonCode,
    result: "DENIED",
  });
  await completeIdempotency(
    transaction,
    context.actorPrincipalId,
    VERIFY_RECIPIENT_CODE_OPERATION,
    input,
    input.deliveryId,
    responseStatusCode,
  );
}

async function completeIdempotency(
  transaction: Transaction,
  actorPrincipalId: string,
  operation: string,
  input: { idempotencyKey: string },
  resourceId: string,
  responseStatusCode = 200,
): Promise<void> {
  await transaction.idempotencyKey.update({
    data: {
      resourceId,
      resourceType: "logistics_delivery",
      responseStatusCode,
      status: "COMPLETED",
      updatedAt: new Date(),
    },
    where: {
      principalId_operation_key: {
        key: input.idempotencyKey,
        operation,
        principalId: actorPrincipalId,
      },
    },
  });
}

async function lockDelivery(
  transaction: Transaction,
  deliveryId: string,
): Promise<{ status: string; version: number } | null> {
  const rows = await transaction.$queryRaw<Array<{ status: string; version: number }>>(Prisma.sql`
    SELECT status::text, version
    FROM logistics_deliveries
    WHERE id = ${deliveryId}::uuid
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

interface LockedDeliveryForProof {
  deliveryNumber: string;
  patientPrincipalId: string;
  pharmacyOrganizationId: string;
  recipientCodeDigest: string;
  recipientCodeExpiresAt: Date;
  recipientCodeKeyId: string;
  status: string;
  version: number;
}

async function lockDeliveryForProof(
  transaction: Transaction,
  deliveryId: string,
): Promise<LockedDeliveryForProof | null> {
  const rows = await transaction.$queryRaw<LockedDeliveryForProof[]>(Prisma.sql`
    SELECT
      delivery.delivery_number AS "deliveryNumber",
      patient.principal_id AS "patientPrincipalId",
      orders.pharmacy_organization_id AS "pharmacyOrganizationId",
      delivery.recipient_code_digest AS "recipientCodeDigest",
      delivery.recipient_code_expires_at AS "recipientCodeExpiresAt",
      delivery.recipient_code_key_id AS "recipientCodeKeyId",
      delivery.status::text,
      delivery.version
    FROM logistics_deliveries delivery
    INNER JOIN pharmacy_orders orders ON orders.id = delivery.order_id
    INNER JOIN patients patient ON patient.id = orders.patient_id
    WHERE delivery.id = ${deliveryId}::uuid
    FOR UPDATE OF delivery
  `);
  return rows[0] ?? null;
}

async function appendAudit(
  transaction: Transaction,
  context: LogisticsRequestContext,
  action: string,
  resourceId: string,
  scope: {
    organizationId?: string;
    reasonCode?: string;
    result?: "DENIED" | "FAILED" | "SUCCEEDED";
  } = {},
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      action,
      actorPrincipalId: context.actorPrincipalId,
      id: createOpaqueId(),
      ...(scope.organizationId === undefined ? {} : { organizationId: scope.organizationId }),
      ...(scope.reasonCode === undefined ? {} : { reasonCode: scope.reasonCode }),
      requestId: context.requestId,
      resourceId,
      resourceType: "logistics_delivery",
      result: scope.result ?? "SUCCEEDED",
    },
  });
}

async function enqueueStatusNotifications(
  transaction: Transaction,
  config: ApiServiceConfig,
  input: {
    deliveryId: string;
    deliveryNumber: string;
    patientPrincipalId: string;
    pharmacyOrganizationId: string;
    status: string;
  },
): Promise<void> {
  const reference = `${input.deliveryNumber}-${input.status}`;
  const deduplicationKey = `logistics-delivery-status:${input.deliveryId}:${input.status}`;
  await enqueueEmailNotification(transaction, config, {
    deduplicationKey,
    recipientPrincipalId: input.patientPrincipalId,
    reference,
    resourceId: input.deliveryId,
    resourceType: "logistics_delivery",
    templateKey: NOTIFICATION_TEMPLATE.LOGISTICS_DELIVERY_STATUS_UPDATED,
  });
  await enqueueOrganizationInboxNotification(transaction, {
    deduplicationKey: `${deduplicationKey}:pharmacy`,
    organizationId: input.pharmacyOrganizationId,
    reference,
    resourceId: input.deliveryId,
    resourceType: "logistics_delivery",
    templateKey: NOTIFICATION_TEMPLATE.LOGISTICS_DELIVERY_STATUS_UPDATED,
  });
}

function historyKey(operation: string, context: LogisticsRequestContext, key: string): string {
  return createHash("sha256")
    .update(`${operation}:${context.actorPrincipalId}:${key}`)
    .digest("hex");
}

function requireDelivery(delivery: LogisticsDeliveryRecord | null): LogisticsDeliveryRecord {
  if (delivery === null) throw new LogisticsConflictError("DELIVERY_NOT_FOUND");
  return delivery;
}

function mapDelivery(row: DeliveryRow): LogisticsDeliveryRecord {
  const activeAssignment = row.assignments[0];
  return {
    acceptedAt: row.acceptedAt,
    activeAssignment:
      activeAssignment === undefined
        ? null
        : {
            assignedAt: activeAssignment.assignedAt,
            courierPrincipalId: activeAssignment.courierPrincipalId,
            id: activeAssignment.id,
            logisticsOrganizationId: activeAssignment.logisticsOrganizationId,
            version: activeAssignment.version,
          },
    arrivedAtDestinationAt: row.arrivedAtDestinationAt,
    arrivedAtPickupAt: row.arrivedAtPickupAt,
    assignedAt: row.assignedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    deliveryAddress: {
      addressLine1: row.deliveryAddressLine1,
      ...(row.deliveryAddressLine2 === null ? {} : { addressLine2: row.deliveryAddressLine2 }),
      administrativeArea: row.deliveryAdministrativeArea,
      countryCode: row.deliveryCountryCode,
      locality: row.deliveryLocality,
      ...(row.deliveryPostalCode === null ? {} : { postalCode: row.deliveryPostalCode }),
    },
    deliveryInstruction: row.deliveryInstruction,
    deliveryNumber: row.deliveryNumber,
    failedAt: row.failedAt,
    handoffId: row.handoffId,
    handoffReference: row.handoff.handoffReference,
    id: row.id,
    logisticsOrganizationId: row.logisticsOrganizationId,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    patientPrincipalId: row.order.patient.principalId,
    pharmacyOrganizationId: row.order.pharmacyOrganizationId,
    pickedUpAt: row.pickedUpAt,
    pickupAddress: {
      addressLine1: row.pickupAddressLine1,
      ...(row.pickupAddressLine2 === null ? {} : { addressLine2: row.pickupAddressLine2 }),
      administrativeArea: row.pickupAdministrativeArea,
      countryCode: row.pickupCountryCode,
      locality: row.pickupLocality,
      ...(row.pickupPostalCode === null ? {} : { postalCode: row.pickupPostalCode }),
    },
    pickupContactName: row.pickupContactName,
    pickupContactPhoneE164: row.pickupContactPhoneE164,
    pickupLocationName: row.pickupLocationName,
    pickupVerifiedAt: row.pickupVerifiedAt,
    recipientName: row.recipientName,
    recipientPhoneE164: row.recipientPhoneE164,
    returnedAt: row.returnedAt,
    status: row.status,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
