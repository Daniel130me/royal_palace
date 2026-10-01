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
        createOpaqueId(),
        "booking-key-123",
      ),
    ).rejects.toMatchObject<Partial<SchedulingPaymentFlowError>>({
      code: "idempotency_conflict",
      status: 409,
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
        patientId: createOpaqueId(),
        patientPrincipalId,
        providerCode: "SYNTHETIC",
        providerPaymentReference: "provider-reference",
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
