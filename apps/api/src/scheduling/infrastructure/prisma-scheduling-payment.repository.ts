import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  ConsultationFeeResponse,
  HostedCheckoutResponse,
  PaymentReconciliationResponse,
  PaymentStatus,
  PractitionerAvailabilityResponse,
  PublicConsultationMode,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { enqueueEmailNotification } from "../../notification/infrastructure/enqueue-notification.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import { resolvePaymentTransition } from "../domain/payment-state-machine.js";
import {
  SchedulingPaymentConflictError,
  type AppointmentAccessRecord,
  type PaymentAccessRecord,
  type ProviderPaymentObservation,
  type SchedulingPaymentRepository,
  type VerifiedPaymentEvent,
} from "../domain/scheduling-payment.types.js";

const BOOK_OPERATION = "BOOK_APPOINTMENT";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const PROVIDER_CLEARING = "PAYMENT_PROVIDER_CLEARING";
const CUSTOMER_FUNDS_CLEARING = "CUSTOMER_FUNDS_CLEARING";

class SlotUnavailableError extends Error {}

@Injectable()
export class PrismaSchedulingPaymentRepository implements SchedulingPaymentRepository {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async findPractitionerPrincipal(practitionerId: string): Promise<string | null | undefined> {
    const record = await this.database.practitioner.findUnique({
      select: { principalId: true },
      where: { id: practitionerId },
    });
    return record?.principalId;
  }

  async findPatientIdByPrincipal(principalId: string): Promise<string | null> {
    const record = await this.database.patient.findUnique({
      select: { id: true },
      where: { principalId },
    });
    return record?.id ?? null;
  }

  async listAvailability(input: {
    from: Date;
    limit: number;
    practitionerId: string;
    to: Date;
  }): Promise<PractitionerAvailabilityResponse[]> {
    const rows = await this.database.availabilitySlot.findMany({
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        consultationFee: { select: { amountMinor: true, currency: true, mode: true } },
        endsAt: true,
        id: true,
        practitionerId: true,
        startsAt: true,
      },
      take: input.limit,
      where: {
        consultationFee: { status: "ACTIVE" },
        practitionerId: input.practitionerId,
        startsAt: { gte: input.from, lt: input.to },
        status: "OPEN",
      },
    });
    return rows.map((row) => mapAvailability(row));
  }

  async createConsultationFee(input: {
    amountMinor: bigint;
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    mode: PublicConsultationMode;
    practitionerId: string;
  }): Promise<ConsultationFeeResponse> {
    const row = await this.database.consultationFee.create({
      data: {
        amountMinor: input.amountMinor,
        createdByPrincipalId: input.createdByPrincipalId,
        currency: input.currency,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        id: createOpaqueId(),
        mode: input.mode,
        practitionerId: input.practitionerId,
        updatedAt: new Date(),
      },
    });
    return mapFee(row);
  }

  async activateConsultationFee(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    feeId: string;
  }): Promise<ConsultationFeeResponse | null> {
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.consultationFee.updateMany({
        data: {
          approvedByPrincipalId: input.approvedByPrincipalId,
          status: "ACTIVE",
          updatedAt: new Date(),
          version: { increment: 1 },
        },
        where: { id: input.feeId, status: "DRAFT", version: input.expectedVersion },
      });
      if (result.count !== 1) return null;
      return mapFee(
        await transaction.consultationFee.findUniqueOrThrow({ where: { id: input.feeId } }),
      );
    });
  }

  async createAvailabilitySlot(input: {
    consultationFeeId: string;
    createdByPrincipalId: string;
    endsAt: Date;
    practitionerId: string;
    startsAt: Date;
  }): Promise<PractitionerAvailabilityResponse | null> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const fee = await transaction.consultationFee.findFirst({
          select: { amountMinor: true, currency: true, id: true, mode: true },
          where: {
            effectiveFrom: { lte: input.startsAt },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: input.startsAt } }],
            id: input.consultationFeeId,
            practitionerId: input.practitionerId,
            status: "ACTIVE",
          },
        });
        if (fee === null) return null;
        const row = await transaction.availabilitySlot.create({
          data: {
            consultationFeeId: fee.id,
            createdByPrincipalId: input.createdByPrincipalId,
            endsAt: input.endsAt,
            id: createOpaqueId(),
            practitionerId: input.practitionerId,
            startsAt: input.startsAt,
            updatedAt: new Date(),
          },
          select: { endsAt: true, id: true, practitionerId: true, startsAt: true },
        });
        return mapAvailability({ ...row, consultationFee: fee });
      });
    } catch (error) {
      if (isConstraintConflict(error)) return null;
      throw error;
    }
  }

  async bookAppointment(input: {
    idempotencyKey: string;
    patientPrincipalId: string;
    paymentDueAt: Date;
    requestHash: string;
    slotId: string;
  }): Promise<AppointmentAccessRecord | null> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
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
              throw new SchedulingPaymentConflictError("IDEMPOTENCY_CONFLICT");
            }
            if (existing.status === "COMPLETED" && existing.resourceId !== null) {
              const appointment = await findAppointmentRecord(transaction, existing.resourceId);
              if (appointment !== null) return mapAppointment(appointment);
            }
            throw new SchedulingPaymentConflictError("IDEMPOTENCY_CONFLICT");
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
          const patient = await transaction.patient.findUniqueOrThrow({
            select: { id: true },
            where: { principalId: input.patientPrincipalId },
          });
          const claimed = await transaction.availabilitySlot.updateMany({
            data: { status: "BOOKED", updatedAt: new Date(), version: { increment: 1 } },
            where: { id: input.slotId, startsAt: { gt: new Date() }, status: "OPEN" },
          });
          if (claimed.count !== 1) throw new SlotUnavailableError();
          const slot = await transaction.availabilitySlot.findUniqueOrThrow({
            include: {
              consultationFee: true,
              practitioner: { select: { displayName: true, principalId: true } },
            },
            where: { id: input.slotId },
          });
          const appointmentId = createOpaqueId();
          const paymentId = createOpaqueId();
          await transaction.appointment.create({
            data: {
              amountMinor: slot.consultationFee.amountMinor,
              availabilitySlotId: slot.id,
              currency: slot.consultationFee.currency,
              endsAt: slot.endsAt,
              id: appointmentId,
              mode: slot.consultationFee.mode,
              patientId: patient.id,
              paymentDueAt: input.paymentDueAt,
              practitionerId: slot.practitionerId,
              startsAt: slot.startsAt,
              updatedAt: new Date(),
            },
          });
          await transaction.payment.create({
            data: {
              amountMinor: slot.consultationFee.amountMinor,
              appointmentId,
              currency: slot.consultationFee.currency,
              id: paymentId,
              payableUntil: input.paymentDueAt,
              patientId: patient.id,
              purpose: "CONSULTATION",
              providerCode: "UNASSIGNED",
              reference: `payment_${paymentId}`,
              updatedAt: new Date(),
            },
          });
          await transaction.paymentStatusHistory.create({
            data: {
              id: createOpaqueId(),
              occurredAt: new Date(),
              paymentId,
              reasonCode: "APPOINTMENT_BOOKED",
              toStatus: "CREATED",
            },
          });
          await enqueueEmailNotification(transaction, this.config, {
            deduplicationKey: `appointment:${appointmentId}:status:PENDING_PAYMENT:v1`,
            recipientPrincipalId: input.patientPrincipalId,
            reference: `APPOINTMENT-${appointmentId.toUpperCase()}`,
            templateKey: "APPOINTMENT_STATUS_UPDATED",
          });
          await transaction.idempotencyKey.update({
            data: {
              resourceId: appointmentId,
              resourceType: "appointment",
              responseStatusCode: 201,
              status: "COMPLETED",
              updatedAt: new Date(),
            },
            where: { id: idempotencyId },
          });
          return {
            amountMinor: slot.consultationFee.amountMinor.toString(),
            currency: slot.consultationFee.currency,
            endsAt: slot.endsAt.toISOString(),
            id: appointmentId,
            mode: slot.consultationFee.mode,
            patientPrincipalId: input.patientPrincipalId,
            paymentId,
            practitioner: { displayName: slot.practitioner.displayName, id: slot.practitionerId },
            practitionerPrincipalId: slot.practitioner.principalId,
            startsAt: slot.startsAt.toISOString(),
            status: "PENDING_PAYMENT",
            version: 1,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof SlotUnavailableError) return null;
      if (error instanceof SchedulingPaymentConflictError) throw error;
      if (isConstraintConflict(error)) return null;
      throw error;
    }
  }

  async findAppointment(appointmentId: string): Promise<AppointmentAccessRecord | null> {
    const record = await findAppointmentRecord(this.database, appointmentId);
    return record === null ? null : mapAppointment(record);
  }

  async findPayment(paymentId: string): Promise<PaymentAccessRecord | null> {
    const row = await this.database.payment.findUnique({
      select: {
        amountMinor: true,
        appointmentId: true,
        currency: true,
        id: true,
        payableUntil: true,
        patient: { select: { principalId: true } },
        patientId: true,
        pharmacyOrderId: true,
        purpose: true,
        providerCode: true,
        providerPaymentReference: true,
        reference: true,
        status: true,
        updatedAt: true,
      },
      where: { id: paymentId },
    });
    return row === null ? null : mapPayment(row);
  }

  async saveHostedCheckout(input: {
    checkoutUrl: string;
    expiresAt: Date;
    paymentId: string;
    providerCode: string;
    providerPaymentReference: string;
    providerSessionReference: string;
  }): Promise<HostedCheckoutResponse> {
    return this.database.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUniqueOrThrow({
        where: { id: input.paymentId },
      });
      if (
        !["CREATED", "PENDING", "FAILED"].includes(payment.status) ||
        payment.payableUntil <= new Date() ||
        input.expiresAt > payment.payableUntil
      ) {
        throw new SchedulingPaymentConflictError("PAYMENT_NOT_PAYABLE");
      }
      if (
        payment.status === "PENDING" &&
        payment.providerPaymentReference !== null &&
        payment.providerPaymentReference !== input.providerPaymentReference
      ) {
        throw new SchedulingPaymentConflictError("IDEMPOTENCY_CONFLICT");
      }
      const session = await transaction.paymentCheckoutSession.upsert({
        create: {
          checkoutUrl: input.checkoutUrl,
          expiresAt: input.expiresAt,
          id: createOpaqueId(),
          paymentId: input.paymentId,
          providerCode: input.providerCode,
          providerPaymentReference: input.providerPaymentReference,
          providerSessionReference: input.providerSessionReference,
        },
        update: {},
        where: { providerSessionReference: input.providerSessionReference },
      });
      if (
        session.paymentId !== input.paymentId ||
        session.providerCode !== input.providerCode ||
        session.providerPaymentReference !== input.providerPaymentReference
      ) {
        throw new SchedulingPaymentConflictError("IDEMPOTENCY_CONFLICT");
      }
      if (payment.status === "CREATED" || payment.status === "FAILED") {
        await transaction.payment.update({
          data: {
            providerCode: input.providerCode,
            providerPaymentReference: input.providerPaymentReference,
            status: "PENDING",
            updatedAt: new Date(),
            version: { increment: 1 },
          },
          where: { id: input.paymentId },
        });
        await transaction.paymentStatusHistory.create({
          data: {
            fromStatus: payment.status,
            id: createOpaqueId(),
            occurredAt: new Date(),
            paymentId: input.paymentId,
            reasonCode: "HOSTED_CHECKOUT_CREATED",
            toStatus: "PENDING",
          },
        });
      }
      return {
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt.toISOString(),
        paymentId: input.paymentId,
        status: "PENDING",
      };
    });
  }

  async processVerifiedWebhook(input: {
    event: VerifiedPaymentEvent;
    payloadHash: string;
  }): Promise<{ duplicate: boolean; paymentId: string | null; status: PaymentStatus | null }> {
    const duplicate = await this.database.paymentWebhookEvent.findUnique({
      select: { paymentId: true, payment: { select: { status: true } } },
      where: {
        providerCode_providerEventId: {
          providerCode: input.event.providerCode,
          providerEventId: input.event.eventId,
        },
      },
    });
    if (duplicate !== null) {
      return {
        duplicate: true,
        paymentId: duplicate.paymentId,
        status: duplicate.payment?.status ?? null,
      };
    }
    try {
      return await this.database.$transaction(
        (transaction) => this.processWebhookTransaction(transaction, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isConstraintConflict(error)) throw error;
      const raced = await this.database.paymentWebhookEvent.findUnique({
        select: { paymentId: true, payment: { select: { status: true } } },
        where: {
          providerCode_providerEventId: {
            providerCode: input.event.providerCode,
            providerEventId: input.event.eventId,
          },
        },
      });
      if (raced === null) throw error;
      return { duplicate: true, paymentId: raced.paymentId, status: raced.payment?.status ?? null };
    }
  }

  async expireDueReservations(input: { limit: number; now: Date }): Promise<{ expired: number }> {
    return this.database.$transaction(
      async (transaction) => {
        const due = await transaction.appointment.findMany({
          orderBy: [{ paymentDueAt: "asc" }, { id: "asc" }],
          select: {
            availabilitySlotId: true,
            id: true,
            payment: { select: { id: true, status: true } },
          },
          take: input.limit,
          where: {
            paymentDueAt: { lte: input.now },
            status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] },
          },
        });
        let expired = 0;
        for (const appointment of due) {
          if (appointment.payment === null) {
            throw new SchedulingPaymentConflictError("INVARIANT_VIOLATION");
          }
          const claimed = await transaction.appointment.updateMany({
            data: {
              cancelledAt: input.now,
              status: "EXPIRED",
              updatedAt: input.now,
              version: { increment: 1 },
            },
            where: {
              id: appointment.id,
              paymentDueAt: { lte: input.now },
              status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] },
            },
          });
          if (claimed.count !== 1) continue;
          const paymentUpdate = await transaction.payment.updateMany({
            data: {
              status: "EXPIRED",
              terminalAt: input.now,
              updatedAt: input.now,
              version: { increment: 1 },
            },
            where: {
              id: appointment.payment.id,
              status: { in: ["CREATED", "PENDING", "FAILED"] },
            },
          });
          if (paymentUpdate.count !== 1) {
            throw new SchedulingPaymentConflictError("INVARIANT_VIOLATION");
          }
          await transaction.paymentStatusHistory.create({
            data: {
              fromStatus: appointment.payment.status,
              id: createOpaqueId(),
              occurredAt: input.now,
              paymentId: appointment.payment.id,
              reasonCode: "RESERVATION_TIMEOUT",
              toStatus: "EXPIRED",
            },
          });
          await transaction.paymentCheckoutSession.updateMany({
            data: { status: "ABANDONED" },
            where: { paymentId: appointment.payment.id, status: "ACTIVE" },
          });
          // Do not reopen capacity until the gateway can authoritatively cancel its checkout.
          // A late, verified success can still restore this slot and appointment atomically.
          await transaction.availabilitySlot.updateMany({
            data: { status: "CANCELLED", updatedAt: input.now, version: { increment: 1 } },
            where: { id: appointment.availabilitySlotId, status: "BOOKED" },
          });
          expired += 1;
        }
        return { expired };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reconcilePayment(input: {
    observation: ProviderPaymentObservation;
    paymentId: string;
    requestedByPrincipalId: string;
  }): Promise<PaymentReconciliationResponse> {
    const payment = await this.database.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
    });
    const matched = payment.status === input.observation.status;
    if (!matched) {
      await this.processVerifiedWebhook({
        event: {
          amountMinor: input.observation.amountMinor,
          currency: input.observation.currency,
          eventId: `reconciliation:${input.paymentId}:${input.observation.observedAt.toISOString()}`,
          eventType: input.observation.status === "CREATED" ? "PENDING" : input.observation.status,
          occurredAt: input.observation.observedAt,
          paymentReference: payment.reference,
          providerCode: payment.providerCode,
          providerPaymentReference: input.observation.providerPaymentReference,
          signatureKeyId: "PROVIDER_API",
        },
        payloadHash: createHash("sha256")
          .update(
            `${input.paymentId}:${input.observation.status}:${input.observation.observedAt.toISOString()}`,
          )
          .digest("hex"),
      });
    }
    const current = await this.database.payment.findUniqueOrThrow({
      select: { status: true },
      where: { id: input.paymentId },
    });
    const applied = !matched && current.status === input.observation.status;
    const result = matched ? "MATCHED" : applied ? "MISMATCH_APPLIED" : "MISMATCH_UNRESOLVED";
    await this.database.paymentReconciliation.create({
      data: {
        applied,
        createdAt: new Date(),
        id: createOpaqueId(),
        internalStatusBefore: payment.status,
        paymentId: input.paymentId,
        providerObservedAt: input.observation.observedAt,
        providerStatus: input.observation.status,
        requestedByPrincipalId: input.requestedByPrincipalId,
        resultCode: result,
      },
    });
    return {
      applied,
      internalStatus: current.status,
      paymentId: input.paymentId,
      providerStatus: input.observation.status,
      result,
    };
  }

  private async processWebhookTransaction(
    transaction: Prisma.TransactionClient,
    input: { event: VerifiedPaymentEvent; payloadHash: string },
  ) {
    const inboxId = createOpaqueId();
    const webhookId = createOpaqueId();
    const processingAt = new Date();
    await transaction.inboxEvent.create({
      data: {
        consumer: `payment-webhook:${input.event.providerCode}`,
        eventType: input.event.eventType,
        id: inboxId,
        messageId: input.event.eventId,
        payloadHash: input.payloadHash,
        processingAt,
        receivedAt: processingAt,
        status: "PROCESSING",
      },
    });
    const payment = await transaction.payment.findUnique({
      include: { appointment: true, patient: { select: { principalId: true } } },
      where: { reference: input.event.paymentReference },
    });
    if (payment === null) {
      await transaction.paymentWebhookEvent.create({
        data: webhookData(input, inboxId, webhookId, "FAILED", "UNKNOWN_PAYMENT_REFERENCE"),
      });
      await transaction.inboxEvent.update({
        data: { lastErrorCode: "UNKNOWN_PAYMENT_REFERENCE", status: "FAILED" },
        where: { id: inboxId },
      });
      return { duplicate: false, paymentId: null, status: null };
    }
    if (
      payment.providerCode !== "UNASSIGNED" &&
      payment.providerCode !== input.event.providerCode
    ) {
      return this.failWebhook(
        transaction,
        input,
        inboxId,
        webhookId,
        payment.id,
        "PROVIDER_MISMATCH",
        payment.status,
      );
    }
    const knownProviderReference =
      payment.providerPaymentReference === input.event.providerPaymentReference ||
      (await transaction.paymentCheckoutSession.count({
        where: {
          paymentId: payment.id,
          providerCode: input.event.providerCode,
          providerPaymentReference: input.event.providerPaymentReference,
        },
      })) === 1;
    if (!knownProviderReference) {
      return this.failWebhook(
        transaction,
        input,
        inboxId,
        webhookId,
        payment.id,
        "PROVIDER_REFERENCE_MISMATCH",
        payment.status,
      );
    }
    if (
      input.event.currency !== undefined &&
      (input.event.currency !== payment.currency ||
        input.event.amountMinor === undefined ||
        input.event.amountMinor <= 0n ||
        input.event.amountMinor > payment.amountMinor)
    ) {
      return this.failWebhook(
        transaction,
        input,
        inboxId,
        webhookId,
        payment.id,
        "AMOUNT_MISMATCH",
        payment.status,
      );
    }
    const remainingRefund = payment.amountMinor - payment.refundedAmountMinor;
    if (
      input.event.eventType === "PARTIALLY_REFUNDED" &&
      (input.event.amountMinor === undefined || input.event.amountMinor >= remainingRefund)
    ) {
      return this.failWebhook(
        transaction,
        input,
        inboxId,
        webhookId,
        payment.id,
        "INVALID_PARTIAL_REFUND",
        payment.status,
      );
    }
    if (input.event.eventType === "REFUNDED" && input.event.amountMinor !== remainingRefund) {
      return this.failWebhook(
        transaction,
        input,
        inboxId,
        webhookId,
        payment.id,
        "INVALID_FINAL_REFUND",
        payment.status,
      );
    }
    const transition = resolvePaymentTransition(payment.status, input.event.eventType);
    if (!transition.apply) {
      await transaction.paymentWebhookEvent.create({
        data: {
          ...webhookData(input, inboxId, webhookId, "IGNORED", "STALE_OR_DUPLICATE_STATE"),
          paymentId: payment.id,
        },
      });
      await markInboxProcessed(transaction, inboxId);
      return { duplicate: false, paymentId: payment.id, status: payment.status };
    }
    await transaction.paymentWebhookEvent.create({
      data: {
        ...webhookData(input, inboxId, webhookId, "PROCESSED"),
        paymentId: payment.id,
        processedAt: new Date(),
      },
    });
    await this.postLedgerEffects(transaction, payment, input.event);
    const now = new Date();
    const refundIncrement = ["PARTIALLY_REFUNDED", "REFUNDED"].includes(transition.target)
      ? (input.event.amountMinor ?? 0n)
      : 0n;
    const refundedAmountMinor =
      transition.target === "REFUNDED"
        ? payment.refundedAmountMinor + refundIncrement
        : payment.refundedAmountMinor + refundIncrement > payment.amountMinor
          ? payment.amountMinor
          : payment.refundedAmountMinor + refundIncrement;
    await transaction.payment.update({
      data: {
        providerCode: input.event.providerCode,
        providerOccurredAt: input.event.occurredAt,
        providerPaymentReference: input.event.providerPaymentReference,
        refundedAmountMinor,
        status: transition.target,
        succeededAt:
          transition.target === "SUCCEEDED" && payment.succeededAt === null
            ? input.event.occurredAt
            : payment.succeededAt,
        terminalAt: isTerminalPayment(transition.target)
          ? input.event.occurredAt
          : payment.terminalAt,
        updatedAt: now,
        version: { increment: 1 },
      },
      where: { id: payment.id },
    });
    await transaction.paymentStatusHistory.create({
      data: {
        fromStatus: payment.status,
        id: createOpaqueId(),
        occurredAt: input.event.occurredAt,
        paymentId: payment.id,
        reasonCode: `PROVIDER_${input.event.eventType}`,
        toStatus: transition.target,
        webhookEventId: webhookId,
      },
    });
    await enqueueEmailNotification(transaction, this.config, {
      deduplicationKey: `payment:${payment.id}:status:${transition.target}:v${payment.version + 1}`,
      recipientPrincipalId: payment.patient.principalId,
      reference: `PAYMENT-${payment.id.toUpperCase()}`,
      templateKey: "PAYMENT_STATUS_UPDATED",
    });
    const checkoutStatus = checkoutStatusForPayment(transition.target);
    if (checkoutStatus !== null) {
      await transaction.paymentCheckoutSession.updateMany({
        data: {
          completedAt: checkoutStatus === "COMPLETED" ? input.event.occurredAt : null,
          status: checkoutStatus,
        },
        where: { paymentId: payment.id, status: "ACTIVE" },
      });
    }
    await applyPaymentSubjectTransition(
      transaction,
      payment,
      transition.target,
      input.event.occurredAt,
    );
    if (transition.target === "SUCCEEDED") {
      await transaction.outboxEvent.create({
        data: {
          aggregateId: payment.id,
          aggregateType: "payment",
          eventType: "patient.activity.settled.v1",
          id: createOpaqueId(),
          payload: {
            activityType: activityTypeForPaymentPurpose(payment.purpose),
            currency: payment.currency,
            grossAmountMinor: payment.amountMinor.toString(),
            patientId: payment.patientId,
            settledAt: input.event.occurredAt.toISOString(),
            sourceEventKey: `${input.event.providerCode}:${input.event.eventId}`,
            sourceType: "PAYMENT_PROVIDER",
          },
        },
      });
    }
    await markInboxProcessed(transaction, inboxId);
    return { duplicate: false, paymentId: payment.id, status: transition.target };
  }

  private async failWebhook(
    transaction: Prisma.TransactionClient,
    input: { event: VerifiedPaymentEvent; payloadHash: string },
    inboxId: string,
    webhookId: string,
    paymentId: string,
    failureCode: string,
    status: PaymentStatus,
  ) {
    await transaction.paymentWebhookEvent.create({
      data: { ...webhookData(input, inboxId, webhookId, "FAILED", failureCode), paymentId },
    });
    await transaction.inboxEvent.update({
      data: { lastErrorCode: failureCode, status: "FAILED" },
      where: { id: inboxId },
    });
    return { duplicate: false, paymentId, status };
  }

  private async postLedgerEffects(
    transaction: Prisma.TransactionClient,
    payment: { amountMinor: bigint; currency: string; id: string },
    event: VerifiedPaymentEvent,
  ): Promise<void> {
    if (event.eventType === "SUCCEEDED") {
      await createLedgerTransaction(transaction, {
        amountMinor: payment.amountMinor,
        creditAccount: CUSTOMER_FUNDS_CLEARING,
        currency: payment.currency,
        debitAccount: PROVIDER_CLEARING,
        eventKey: `${payment.id}:provider-settlement-baseline`,
        occurredAt: event.occurredAt,
        operationType: "PAYMENT_SETTLEMENT",
        paymentId: payment.id,
      });
      return;
    }
    const operation = ledgerOperation(event.eventType);
    if (operation === null) return;
    // A terminal negative event can arrive before success. Recording both sides preserves
    // the provider-reported lifecycle and a zero net position without trusting arrival order.
    await createLedgerTransaction(transaction, {
      amountMinor: payment.amountMinor,
      creditAccount: CUSTOMER_FUNDS_CLEARING,
      currency: payment.currency,
      debitAccount: PROVIDER_CLEARING,
      eventKey: `${payment.id}:provider-settlement-baseline`,
      occurredAt: event.occurredAt,
      operationType: "PAYMENT_SETTLEMENT",
      paymentId: payment.id,
    });
    await createLedgerTransaction(transaction, {
      amountMinor: event.amountMinor ?? payment.amountMinor,
      creditAccount: PROVIDER_CLEARING,
      currency: payment.currency,
      debitAccount: CUSTOMER_FUNDS_CLEARING,
      eventKey: `${event.providerCode}:${event.eventId}:${operation}`,
      occurredAt: event.occurredAt,
      operationType: operation,
      paymentId: payment.id,
    });
  }
}

async function findAppointmentRecord(
  database: PrismaService | Prisma.TransactionClient,
  id: string,
) {
  return database.appointment.findUnique({
    select: {
      amountMinor: true,
      currency: true,
      endsAt: true,
      id: true,
      mode: true,
      patient: { select: { principalId: true } },
      payment: { select: { id: true } },
      practitioner: { select: { displayName: true, id: true, principalId: true } },
      startsAt: true,
      status: true,
      version: true,
    },
    where: { id },
  });
}

function mapAppointment(
  row: NonNullable<Awaited<ReturnType<typeof findAppointmentRecord>>>,
): AppointmentAccessRecord {
  if (row.payment === null) {
    throw new SchedulingPaymentConflictError("INVARIANT_VIOLATION");
  }
  return {
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    endsAt: row.endsAt.toISOString(),
    id: row.id,
    mode: row.mode,
    patientPrincipalId: row.patient.principalId,
    paymentId: row.payment.id,
    practitioner: { displayName: row.practitioner.displayName, id: row.practitioner.id },
    practitionerPrincipalId: row.practitioner.principalId,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    version: row.version,
  };
}

function mapPayment(row: {
  amountMinor: bigint;
  appointmentId: string | null;
  currency: string;
  id: string;
  payableUntil: Date;
  patient: { principalId: string };
  patientId: string;
  pharmacyOrderId: string | null;
  purpose: "CONSULTATION" | "PHARMACY_ORDER";
  providerCode: string;
  providerPaymentReference: string | null;
  reference: string;
  status: PaymentStatus;
  updatedAt: Date;
}): PaymentAccessRecord {
  return {
    amountMinor: row.amountMinor.toString(),
    appointmentId: row.appointmentId,
    currency: row.currency,
    id: row.id,
    payableUntil: row.payableUntil.toISOString(),
    patientId: row.patientId,
    patientPrincipalId: row.patient.principalId,
    pharmacyOrderId: row.pharmacyOrderId,
    providerCode: row.providerCode,
    providerPaymentReference: row.providerPaymentReference,
    purpose: row.purpose,
    reference: row.reference,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAvailability(row: {
  consultationFee: { amountMinor: bigint; currency: string; mode: PublicConsultationMode };
  endsAt: Date;
  id: string;
  practitionerId: string;
  startsAt: Date;
}): PractitionerAvailabilityResponse {
  return {
    amountMinor: row.consultationFee.amountMinor.toString(),
    currency: row.consultationFee.currency,
    endsAt: row.endsAt.toISOString(),
    id: row.id,
    mode: row.consultationFee.mode,
    practitionerId: row.practitionerId,
    startsAt: row.startsAt.toISOString(),
  };
}

function mapFee(row: {
  amountMinor: bigint;
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  id: string;
  mode: PublicConsultationMode;
  practitionerId: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: number;
}): ConsultationFeeResponse {
  return {
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
    id: row.id,
    mode: row.mode,
    practitionerId: row.practitionerId,
    status: row.status,
    version: row.version,
  };
}

function webhookData(
  input: { event: VerifiedPaymentEvent; payloadHash: string },
  inboxEventId: string,
  id: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  outcomeCode?: string,
) {
  return {
    amountMinor: input.event.amountMinor,
    currency: input.event.currency,
    eventType: input.event.eventType,
    outcomeCode,
    id,
    inboxEventId,
    payloadHash: input.payloadHash,
    providerCode: input.event.providerCode,
    providerEventId: input.event.eventId,
    providerOccurredAt: input.event.occurredAt,
    providerPaymentReference: input.event.providerPaymentReference,
    signatureKeyId: input.event.signatureKeyId,
    status,
  } as const;
}

async function markInboxProcessed(transaction: Prisma.TransactionClient, inboxId: string) {
  await transaction.inboxEvent.update({
    data: { processedAt: new Date(), status: "PROCESSED" },
    where: { id: inboxId },
  });
}

async function createLedgerTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    amountMinor: bigint;
    creditAccount: string;
    currency: string;
    debitAccount: string;
    eventKey: string;
    occurredAt: Date;
    operationType: "PAYMENT_SETTLEMENT" | "PAYMENT_REFUND" | "PAYMENT_REVERSAL" | "PAYMENT_DISPUTE";
    paymentId: string;
  },
) {
  const existing = await transaction.ledgerTransaction.findUnique({
    select: { id: true },
    where: { eventKey: input.eventKey },
  });
  if (existing !== null) return;
  await transaction.ledgerTransaction.create({
    data: {
      entries: {
        create: [
          {
            accountCode: input.debitAccount,
            amountMinor: input.amountMinor,
            currency: input.currency,
            direction: "DEBIT",
            id: createOpaqueId(),
          },
          {
            accountCode: input.creditAccount,
            amountMinor: input.amountMinor,
            currency: input.currency,
            direction: "CREDIT",
            id: createOpaqueId(),
          },
        ],
      },
      eventKey: input.eventKey,
      id: createOpaqueId(),
      occurredAt: input.occurredAt,
      operationType: input.operationType,
      paymentId: input.paymentId,
    },
  });
}

async function updateAppointmentFromPayment(
  transaction: Prisma.TransactionClient,
  appointment: { availabilitySlotId: string; id: string; status: string },
  paymentStatus: PaymentStatus,
  occurredAt: Date,
) {
  if (paymentStatus === "SUCCEEDED") {
    await transaction.appointment.updateMany({
      data: {
        confirmedAt: occurredAt,
        status: "CONFIRMED",
        updatedAt: new Date(),
        version: { increment: 1 },
      },
      where: {
        id: appointment.id,
        status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED", "EXPIRED"] },
      },
    });
    await transaction.availabilitySlot.updateMany({
      data: { status: "BOOKED", updatedAt: new Date(), version: { increment: 1 } },
      where: { id: appointment.availabilitySlotId, status: "CANCELLED" },
    });
    return;
  }
  if (paymentStatus === "FAILED") {
    await transaction.appointment.updateMany({
      data: { status: "PAYMENT_FAILED", updatedAt: new Date(), version: { increment: 1 } },
      where: { id: appointment.id, status: "PENDING_PAYMENT" },
    });
    return;
  }
  if (["EXPIRED", "CANCELLED"].includes(paymentStatus)) {
    await transaction.appointment.updateMany({
      data: {
        cancelledAt: occurredAt,
        status: "EXPIRED",
        updatedAt: new Date(),
        version: { increment: 1 },
      },
      where: { id: appointment.id, status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] } },
    });
    return;
  }
  if (["REFUNDED", "REVERSED", "DISPUTED"].includes(paymentStatus)) {
    await transaction.appointment.updateMany({
      data: {
        cancelledAt: occurredAt,
        status: "CANCELLED",
        updatedAt: new Date(),
        version: { increment: 1 },
      },
      where: {
        id: appointment.id,
        status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED", "CONFIRMED"] },
      },
    });
  }
}

async function applyPaymentSubjectTransition(
  transaction: Prisma.TransactionClient,
  payment: {
    appointment: { availabilitySlotId: string; id: string; status: string } | null;
    purpose: "CONSULTATION" | "PHARMACY_ORDER";
  },
  paymentStatus: PaymentStatus,
  occurredAt: Date,
): Promise<void> {
  if (payment.purpose !== "CONSULTATION" || payment.appointment === null) {
    throw new SchedulingPaymentConflictError("INVARIANT_VIOLATION");
  }
  await updateAppointmentFromPayment(transaction, payment.appointment, paymentStatus, occurredAt);
}

function activityTypeForPaymentPurpose(
  purpose: "CONSULTATION" | "PHARMACY_ORDER",
): "CONSULTATION" | "PHARMACY_PURCHASE" {
  return purpose === "CONSULTATION" ? "CONSULTATION" : "PHARMACY_PURCHASE";
}

function checkoutStatusForPayment(
  status: PaymentStatus,
): "COMPLETED" | "EXPIRED" | "ABANDONED" | null {
  if (["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "REVERSED", "DISPUTED"].includes(status)) {
    return "COMPLETED";
  }
  if (status === "EXPIRED") return "EXPIRED";
  if (["FAILED", "CANCELLED"].includes(status)) return "ABANDONED";
  return null;
}

function ledgerOperation(eventType: VerifiedPaymentEvent["eventType"]) {
  if (eventType === "REFUNDED" || eventType === "PARTIALLY_REFUNDED")
    return "PAYMENT_REFUND" as const;
  if (eventType === "REVERSED") return "PAYMENT_REVERSAL" as const;
  if (eventType === "DISPUTED") return "PAYMENT_DISPUTE" as const;
  return null;
}

function isTerminalPayment(status: PaymentStatus): boolean {
  return ["EXPIRED", "CANCELLED", "REVERSED", "REFUNDED", "DISPUTED"].includes(status);
}

function isConstraintConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2004")
  );
}
