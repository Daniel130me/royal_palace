import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  CurrentSession,
  PaymentStatusResponse,
  PublicConsultationMode,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  SCHEDULING_PAYMENT_REPOSITORY,
  SchedulingPaymentConflictError,
  type SchedulingPaymentRepository,
} from "../domain/scheduling-payment.types.js";
import { PaymentGatewayError } from "../infrastructure/payment-gateway.adapters.js";

const MAX_AVAILABILITY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

export interface SchedulingRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class SchedulingPaymentFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SchedulingPaymentFlowError";
  }
}

@Injectable()
export class SchedulingPaymentService {
  constructor(
    @Inject(SCHEDULING_PAYMENT_REPOSITORY)
    private readonly repository: SchedulingPaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async listAvailability(input: { from: string; practitionerId: string; to: string }) {
    const from = parseInstant(input.from);
    const to = parseInstant(input.to);
    if (to <= from || to.getTime() - from.getTime() > MAX_AVAILABILITY_WINDOW_MS) {
      throw new SchedulingPaymentFlowError(
        "invalid_availability_range",
        400,
        "Availability range is invalid",
      );
    }
    return this.repository.listAvailability({
      from,
      limit: 200,
      practitionerId: input.practitionerId,
      to,
    });
  }

  async createConsultationFee(
    context: SchedulingRequestContext,
    practitionerId: string,
    input: {
      amountMinor: string;
      currency: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      mode: PublicConsultationMode;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: practitionerId, resourceType: "consultation_fee" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_CONSULTATION_FEES,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const effectiveFrom = parseInstant(input.effectiveFrom);
    const effectiveUntil =
      input.effectiveUntil === undefined ? undefined : parseInstant(input.effectiveUntil);
    if (effectiveUntil !== undefined && effectiveUntil <= effectiveFrom) {
      throw new SchedulingPaymentFlowError("invalid_fee_validity", 400, "Fee validity is invalid");
    }
    return this.repository.createConsultationFee({
      amountMinor: parsePositiveMinor(input.amountMinor),
      createdByPrincipalId: context.actor.principalId,
      currency: normalizeCurrency(input.currency),
      effectiveFrom,
      ...(effectiveUntil === undefined ? {} : { effectiveUntil }),
      mode: input.mode,
      practitionerId,
    });
  }

  async activateConsultationFee(
    context: SchedulingRequestContext,
    feeId: string,
    expectedVersion: number,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: feeId, resourceType: "consultation_fee" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_CONSULTATION_FEES,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const fee = await this.repository.activateConsultationFee({
      approvedByPrincipalId: context.actor.principalId,
      expectedVersion,
      feeId,
    });
    if (fee === null)
      throw new SchedulingPaymentFlowError("fee_conflict", 409, "Fee changed or is unavailable");
    return fee;
  }

  async createAvailability(
    context: SchedulingRequestContext,
    input: { consultationFeeId: string; endsAt: string; practitionerId: string; startsAt: string },
  ) {
    const practitionerPrincipalId = await this.repository.findPractitionerPrincipal(
      input.practitionerId,
    );
    if (practitionerPrincipalId === undefined) {
      throw new SchedulingPaymentFlowError(
        "practitioner_not_found",
        404,
        "Practitioner was not found",
      );
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: practitionerPrincipalId ?? "",
        resourceId: input.practitionerId,
        resourceType: "practitioner_availability",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_PRACTITIONER_AVAILABILITY,
      requestId: context.requestId,
    });
    const startsAt = parseInstant(input.startsAt);
    const endsAt = parseInstant(input.endsAt);
    if (startsAt <= new Date() || endsAt <= startsAt) {
      throw new SchedulingPaymentFlowError("invalid_availability", 400, "Availability is invalid");
    }
    const slot = await this.repository.createAvailabilitySlot({
      consultationFeeId: input.consultationFeeId,
      createdByPrincipalId: context.actor.principalId,
      endsAt,
      practitionerId: input.practitionerId,
      startsAt,
    });
    if (slot === null) {
      throw new SchedulingPaymentFlowError(
        "availability_conflict",
        409,
        "Availability overlaps another slot or its fee is unavailable",
      );
    }
    return slot;
  }

  async bookAppointment(context: SchedulingRequestContext, slotId: string, idempotencyKey: string) {
    const patientId = await this.repository.findPatientIdByPrincipal(context.actor.principalId);
    if (patientId === null) {
      throw new SchedulingPaymentFlowError(
        "patient_profile_required",
        403,
        "Patient profile is required",
      );
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        resourceId: slotId,
        resourceType: "appointment",
      },
      policy: AUTHORIZATION_POLICY.BOOK_APPOINTMENT,
      requestId: context.requestId,
    });
    const requestHash = createHash("sha256").update(`book-appointment:${slotId}`).digest("hex");
    let appointment: Awaited<ReturnType<SchedulingPaymentRepository["bookAppointment"]>>;
    try {
      appointment = await this.repository.bookAppointment({
        idempotencyKey,
        patientPrincipalId: context.actor.principalId,
        paymentDueAt: new Date(
          Date.now() + this.config.paymentGateway.reservationTtlSeconds * 1000,
        ),
        requestHash,
        slotId,
      });
    } catch (error) {
      this.rethrowRepositoryConflict(error);
      throw error;
    }
    if (appointment === null) {
      throw new SchedulingPaymentFlowError(
        "slot_unavailable",
        409,
        "The appointment slot is unavailable",
      );
    }
    return publicAppointment(appointment);
  }

  async getAppointment(context: SchedulingRequestContext, appointmentId: string) {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (appointment === null)
      throw new SchedulingPaymentFlowError(
        "appointment_not_found",
        404,
        "Appointment was not found",
      );
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: appointment.patientPrincipalId,
        practitionerPrincipalId: appointment.practitionerPrincipalId,
        resourceId: appointment.id,
        resourceType: "appointment",
      },
      policy: AUTHORIZATION_POLICY.VIEW_APPOINTMENT,
      requestId: context.requestId,
    });
    return publicAppointment(appointment);
  }

  async createHostedCheckout(
    context: SchedulingRequestContext,
    paymentId: string,
    idempotencyKey: string,
  ) {
    const payment = await this.requireOwnedPayment(context, paymentId);
    if (!["CREATED", "PENDING", "FAILED"].includes(payment.status)) {
      throw new SchedulingPaymentFlowError("payment_not_payable", 409, "Payment is not payable");
    }
    try {
      const session = await this.gateway.createHostedCheckout({
        amountMinor: BigInt(payment.amountMinor),
        currency: payment.currency,
        idempotencyKey,
        paymentReference: payment.reference,
      });
      return await this.repository.saveHostedCheckout({
        ...session,
        paymentId: payment.id,
        providerCode: this.gateway.providerCode,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayError) {
        throw new SchedulingPaymentFlowError(error.code, 503, error.message);
      }
      this.rethrowRepositoryConflict(error);
      throw error;
    }
  }

  async getPaymentStatus(
    context: SchedulingRequestContext,
    paymentId: string,
  ): Promise<PaymentStatusResponse> {
    const payment = await this.requireOwnedPayment(context, paymentId);
    return publicPayment(payment);
  }

  async processWebhook(input: {
    headers: Readonly<Record<string, string | string[] | undefined>>;
    providerCode: string;
    rawBody: Buffer;
  }) {
    if (input.providerCode.toUpperCase() !== this.gateway.providerCode) {
      throw new SchedulingPaymentFlowError(
        "unsupported_payment_provider",
        404,
        "Payment provider is unavailable",
      );
    }
    try {
      const event = this.gateway.verifyWebhook({ headers: input.headers, rawBody: input.rawBody });
      const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
      return this.repository.processVerifiedWebhook({ event, payloadHash });
    } catch (error) {
      if (error instanceof PaymentGatewayError) {
        throw new SchedulingPaymentFlowError(error.code, 401, error.message);
      }
      throw error;
    }
  }

  async reconcilePayment(context: SchedulingRequestContext, paymentId: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: paymentId, resourceType: "payment" },
      policy: AUTHORIZATION_POLICY.RECONCILE_PAYMENT,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const payment = await this.repository.findPayment(paymentId);
    if (payment === null)
      throw new SchedulingPaymentFlowError("payment_not_found", 404, "Payment was not found");
    if (payment.providerPaymentReference === null) {
      throw new SchedulingPaymentFlowError(
        "payment_not_initialized",
        409,
        "Payment has no provider reference",
      );
    }
    try {
      const observation = await this.gateway.retrievePayment(payment.providerPaymentReference);
      return this.repository.reconcilePayment({
        observation,
        paymentId,
        requestedByPrincipalId: context.actor.principalId,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayError) {
        throw new SchedulingPaymentFlowError(error.code, 503, error.message);
      }
      throw error;
    }
  }

  async expireDueReservations(context: SchedulingRequestContext, limit: number) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: "due-reservations", resourceType: "appointment_reservation" },
      policy: AUTHORIZATION_POLICY.EXPIRE_APPOINTMENT_RESERVATIONS,
      requestId: context.requestId,
    });
    return this.repository.expireDueReservations({ limit, now: new Date() });
  }

  private async requireOwnedPayment(context: SchedulingRequestContext, paymentId: string) {
    const payment = await this.repository.findPayment(paymentId);
    if (payment === null)
      throw new SchedulingPaymentFlowError("payment_not_found", 404, "Payment was not found");
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: payment.patientPrincipalId,
        resourceId: payment.id,
        resourceType: "payment",
      },
      policy: AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT,
      requestId: context.requestId,
    });
    return payment;
  }

  private assertPrivilegedAssurance(session: CurrentSession): void {
    const ageMilliseconds = Date.now() - new Date(session.authenticatedAt).getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(ageMilliseconds) ||
      ageMilliseconds < 0 ||
      ageMilliseconds > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new SchedulingPaymentFlowError(
        "step_up_required",
        403,
        "Step-up authentication is required",
      );
    }
  }

  private rethrowRepositoryConflict(error: unknown): never | void {
    if (!(error instanceof SchedulingPaymentConflictError)) return;
    if (error.reason === "IDEMPOTENCY_CONFLICT") {
      throw new SchedulingPaymentFlowError(
        "idempotency_conflict",
        409,
        "The idempotency key is already associated with another request",
      );
    }
    if (error.reason === "PAYMENT_NOT_PAYABLE") {
      throw new SchedulingPaymentFlowError("payment_not_payable", 409, "Payment is not payable");
    }
    throw new SchedulingPaymentFlowError(
      "scheduling_payment_invariant_violation",
      409,
      "Scheduling or payment data is inconsistent",
    );
  }
}

function publicAppointment(
  record: Awaited<ReturnType<SchedulingPaymentRepository["findAppointment"]>> & object,
) {
  const {
    patientPrincipalId: _patient,
    practitionerPrincipalId: _practitioner,
    ...response
  } = record;
  return response;
}

function publicPayment(
  record: Awaited<ReturnType<SchedulingPaymentRepository["findPayment"]>> & object,
): PaymentStatusResponse {
  const {
    patientId: _patientId,
    patientPrincipalId: _principal,
    providerCode: _provider,
    providerPaymentReference: _providerReference,
    reference: _reference,
    ...response
  } = record;
  return response;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new SchedulingPaymentFlowError("invalid_currency", 400, "Currency is invalid");
  }
  return normalized;
}

function parsePositiveMinor(value: string): bigint {
  if (!/^\d{1,19}$/.test(value)) {
    throw new SchedulingPaymentFlowError("invalid_amount", 400, "Amount is invalid");
  }
  const parsed = BigInt(value);
  if (parsed <= 0n)
    throw new SchedulingPaymentFlowError("invalid_amount", 400, "Amount is invalid");
  return parsed;
}

function parseInstant(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SchedulingPaymentFlowError("invalid_timestamp", 400, "Timestamp is invalid");
  }
  return parsed;
}
