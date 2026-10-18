import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { SchedulingPaymentService } from "../src/scheduling/application/scheduling-payment.service.js";
import type { SchedulingPaymentFlowError } from "../src/scheduling/application/scheduling-payment.service.js";
import {
  type PaymentGateway,
  SchedulingPaymentConflictError,
  type SchedulingPaymentRepository,
} from "../src/scheduling/domain/scheduling-payment.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  principalId = createOpaqueId(),
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: testConfig.identity.privilegedAssuranceContext,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function createService(
  repository: Partial<SchedulingPaymentRepository>,
  gateway: Partial<PaymentGateway> = {},
) {
  return new SchedulingPaymentService(
    repository as SchedulingPaymentRepository,
    { providerCode: "SYNTHETIC", ...gateway } as PaymentGateway,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    testConfig,
  );
}

describe("SchedulingPaymentService", () => {
  it("derives patient appointment ownership and binds cursors to the query", async () => {
    const principalId = createOpaqueId();
    const cursor = { id: createOpaqueId(), startsAt: new Date("2026-10-18T10:00:00.000Z") };
    const listPatientAppointments = vi.fn(async () => ({ cursor, data: [] }));
    const scheduling = createService({ listPatientAppointments });

    const first = await scheduling.listPatientAppointments(
      { actor: session("PATIENT", principalId), requestId: "request-patient-list" },
      { limit: 25, scope: "UPCOMING" },
    );

    expect(listPatientAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, principalId, scope: "UPCOMING" }),
    );
    expect(first.pageInfo.endCursor).not.toBeNull();
    await expect(
      scheduling.listPatientAppointments(
        { actor: session("PATIENT", principalId), requestId: "request-patient-list-next" },
        { cursor: first.pageInfo.endCursor ?? undefined, limit: 25, scope: "COMPLETED" },
      ),
    ).rejects.toMatchObject<Partial<SchedulingPaymentFlowError>>({
      code: "invalid_cursor",
      status: 400,
    });
  });

  it("does not allow a patient to use the practitioner appointment list", async () => {
    const listProviderAppointments = vi.fn(async () => ({ cursor: null, data: [] }));
    await expect(
      createService({ listProviderAppointments }).listProviderAppointments(
        { actor: session("PATIENT"), requestId: "request-cross-role-list" },
        { limit: 25, scope: "ALL" },
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    expect(listProviderAppointments).not.toHaveBeenCalled();
  });

  it("returns a controlled conflict for a reused idempotency key", async () => {
    const repository = {
      bookAppointment: vi.fn<SchedulingPaymentRepository["bookAppointment"]>(async () => {
        throw new SchedulingPaymentConflictError("IDEMPOTENCY_CONFLICT");
      }),
      findPatientIdByPrincipal: vi.fn(async () => createOpaqueId()),
    };
    const principalId = createOpaqueId();

    await expect(
      createService(repository).bookAppointment(
        { actor: session("PATIENT", principalId), requestId: "request-book" },
        {
          consentEvidenceCode: "APPOINTMENT_INTAKE_V1",
          reason: "Persistent headache",
          slotId: createOpaqueId(),
        },
        "booking-key-123",
      ),
    ).rejects.toMatchObject<Partial<SchedulingPaymentFlowError>>({
      code: "idempotency_conflict",
      status: 409,
    });
  });

  it("lets only the owning patient revoke appointment intake consent with version control", async () => {
    const patientPrincipalId = createOpaqueId();
    const appointmentId = createOpaqueId();
    const practitionerPrincipalId = createOpaqueId();
    const intake = {
      consentedAt: "2026-10-18T10:00:00.000Z",
      consentStatus: "GRANTED" as const,
      reason: "Persistent headache",
      revokedAt: null,
      symptoms: "Worse in the morning",
      version: 2,
    };
    const appointment = {
      amountMinor: "12500",
      currency: "USD",
      endsAt: "2026-10-20T10:30:00.000Z",
      id: appointmentId,
      intake,
      mode: "VIDEO" as const,
      patientPrincipalId,
      paymentId: createOpaqueId(),
      practitioner: { displayName: "Synthetic Practitioner", id: createOpaqueId() },
      practitionerPrincipalId,
      startsAt: "2026-10-20T10:00:00.000Z",
      status: "CONFIRMED" as const,
      version: 1,
    };
    const revokeAppointmentIntake = vi.fn(async () => ({
      ...appointment,
      intake: {
        ...intake,
        consentStatus: "REVOKED" as const,
        revokedAt: "2026-10-18T11:00:00.000Z",
        version: 3,
      },
    }));
    const scheduling = createService({
      findAppointment: vi.fn(async () => appointment),
      revokeAppointmentIntake,
    });

    await expect(
      scheduling.revokeAppointmentIntake(
        { actor: session("PATIENT", patientPrincipalId), requestId: "request-revoke-intake" },
        appointmentId,
        2,
      ),
    ).resolves.toMatchObject({ intake: { consentStatus: "REVOKED", version: 3 } });
    expect(revokeAppointmentIntake).toHaveBeenCalledWith({
      appointmentId,
      expectedVersion: 2,
      patientPrincipalId,
      requestId: "request-revoke-intake",
      revokedAt: expect.any(Date),
    });
  });

  it("does not expose patient payment amounts to managers", async () => {
    const patientPrincipalId = createOpaqueId();
    const repository = {
      findPayment: vi.fn<SchedulingPaymentRepository["findPayment"]>(async () => ({
        amountMinor: "12500",
        appointmentId: createOpaqueId(),
        currency: "USD",
        id: createOpaqueId(),
        laboratoryBookingId: null,
        payableUntil: new Date(Date.now() + 60_000).toISOString(),
        patientId: createOpaqueId(),
        patientPrincipalId,
        pharmacyOrderId: null,
        providerCode: "SYNTHETIC",
        providerPaymentReference: "provider-reference",
        purpose: "CONSULTATION",
        reference: "payment-reference",
        status: "PENDING",
        updatedAt: new Date().toISOString(),
      })),
    };

    await expect(
      createService(repository).getPaymentStatus(
        { actor: session("MANAGER"), requestId: "request-private-payment" },
        createOpaqueId(),
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("allows only the system worker to expire bounded reservation batches", async () => {
    const expireDueReservations = vi.fn(async () => ({ expired: 2 }));
    const scheduling = createService({ expireDueReservations });

    await expect(
      scheduling.expireDueReservations(
        { actor: session("ADMINISTRATOR"), requestId: "request-admin-expiry" },
        20,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(
      scheduling.expireDueReservations(
        { actor: session("SYSTEM_WORKER"), requestId: "request-worker-expiry" },
        20,
      ),
    ).resolves.toEqual({ expired: 2 });
    expect(expireDueReservations).toHaveBeenCalledWith({
      limit: 20,
      now: expect.any(Date),
    });
  });
});
