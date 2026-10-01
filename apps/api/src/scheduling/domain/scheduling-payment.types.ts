import type {
  AppointmentResponse,
  ConsultationFeeResponse,
  HostedCheckoutResponse,
  PaymentReconciliationResponse,
  PaymentStatus,
  PaymentStatusResponse,
  PractitionerAvailabilityResponse,
  PublicConsultationMode,
} from "@royal-palace/contracts";

export interface AppointmentAccessRecord extends AppointmentResponse {
  patientPrincipalId: string;
  practitionerPrincipalId: string | null;
}

export interface PaymentAccessRecord extends PaymentStatusResponse {
  patientId: string;
  patientPrincipalId: string;
  providerCode: string;
  providerPaymentReference: string | null;
  reference: string;
}

export interface VerifiedPaymentEvent {
  amountMinor?: bigint;
  currency?: string;
  eventId: string;
  eventType:
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED"
    | "EXPIRED"
    | "CANCELLED"
    | "REVERSED"
    | "PARTIALLY_REFUNDED"
    | "REFUNDED"
    | "DISPUTED";
  occurredAt: Date;
  paymentReference: string;
  providerCode: string;
  providerPaymentReference: string;
  signatureKeyId: string;
}

export interface ProviderPaymentObservation {
  amountMinor: bigint;
  currency: string;
  observedAt: Date;
  providerPaymentReference: string;
  status: PaymentStatus;
}

export class SchedulingPaymentConflictError extends Error {
  constructor(
    readonly reason: "IDEMPOTENCY_CONFLICT" | "INVARIANT_VIOLATION" | "PAYMENT_NOT_PAYABLE",
  ) {
    super(reason);
    this.name = "SchedulingPaymentConflictError";
  }
}

export interface PaymentGateway {
  readonly providerCode: string;
  createHostedCheckout(input: {
    amountMinor: bigint;
    currency: string;
    idempotencyKey: string;
    paymentReference: string;
  }): Promise<{
    checkoutUrl: string;
    expiresAt: Date;
    providerPaymentReference: string;
    providerSessionReference: string;
  }>;
  retrievePayment(providerPaymentReference: string): Promise<ProviderPaymentObservation>;
  verifyWebhook(input: {
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: Buffer;
  }): VerifiedPaymentEvent;
}

export interface SchedulingPaymentRepository {
  activateConsultationFee(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    feeId: string;
  }): Promise<ConsultationFeeResponse | null>;
  bookAppointment(input: {
    idempotencyKey: string;
    patientPrincipalId: string;
    paymentDueAt: Date;
    requestHash: string;
    slotId: string;
  }): Promise<AppointmentAccessRecord | null>;
  createAvailabilitySlot(input: {
    consultationFeeId: string;
    createdByPrincipalId: string;
    endsAt: Date;
    practitionerId: string;
    startsAt: Date;
  }): Promise<PractitionerAvailabilityResponse | null>;
  createConsultationFee(input: {
    amountMinor: bigint;
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    mode: PublicConsultationMode;
    practitionerId: string;
  }): Promise<ConsultationFeeResponse>;
  expireDueReservations(input: { limit: number; now: Date }): Promise<{ expired: number }>;
  findAppointment(appointmentId: string): Promise<AppointmentAccessRecord | null>;
  findPayment(paymentId: string): Promise<PaymentAccessRecord | null>;
  findPractitionerPrincipal(practitionerId: string): Promise<string | null | undefined>;
  findPatientIdByPrincipal(principalId: string): Promise<string | null>;
  listAvailability(input: {
    from: Date;
    limit: number;
    practitionerId: string;
    to: Date;
  }): Promise<PractitionerAvailabilityResponse[]>;
  processVerifiedWebhook(input: {
    event: VerifiedPaymentEvent;
    payloadHash: string;
  }): Promise<{ duplicate: boolean; paymentId: string | null; status: PaymentStatus | null }>;
  reconcilePayment(input: {
    observation: ProviderPaymentObservation;
    paymentId: string;
    requestedByPrincipalId: string;
  }): Promise<PaymentReconciliationResponse>;
  saveHostedCheckout(input: {
    checkoutUrl: string;
    expiresAt: Date;
    paymentId: string;
    providerCode: string;
    providerPaymentReference: string;
    providerSessionReference: string;
  }): Promise<HostedCheckoutResponse>;
}

export const SCHEDULING_PAYMENT_REPOSITORY = Symbol("SCHEDULING_PAYMENT_REPOSITORY");
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");
