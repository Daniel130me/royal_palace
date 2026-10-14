import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { LaboratoryReviewService } from "../src/laboratory/application/laboratory-review.service.js";
import type { LaboratoryReviewRepository } from "../src/laboratory/domain/laboratory-review.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

function session(
  role: CurrentSession["roles"][number],
  principalId = createOpaqueId(),
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function service(repository: Partial<LaboratoryReviewRepository>) {
  return new LaboratoryReviewService(
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    repository as LaboratoryReviewRepository,
  );
}

describe("LaboratoryReviewService", () => {
  it("allows only the patient who received a completed service to submit one rating", async () => {
    const patientPrincipalId = createOpaqueId();
    const bookingId = createOpaqueId();
    const submit = vi.fn(async () => ({
      bookingId,
      comment: null,
      commentStatus: "NOT_PROVIDED" as const,
      id: createOpaqueId(),
      score: 5,
      submittedAt: new Date().toISOString(),
    }));
    const reviews = service({
      findEligibility: vi.fn(async () => ({
        bookingId,
        laboratoryOrganizationId: createOpaqueId(),
        patientId: createOpaqueId(),
        patientPrincipalId,
        status: "COMPLETED",
      })),
      submit,
    });

    await expect(
      reviews.submit(
        { actor: session("PATIENT", patientPrincipalId), requestId: "request-review-001" },
        bookingId,
        { score: 5 },
      ),
    ).resolves.toMatchObject({ bookingId, score: 5 });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("denies another patient even when they know the booking identifier", async () => {
    const bookingId = createOpaqueId();
    const reviews = service({
      findEligibility: vi.fn(async () => ({
        bookingId,
        laboratoryOrganizationId: createOpaqueId(),
        patientId: createOpaqueId(),
        patientPrincipalId: createOpaqueId(),
        status: "COMPLETED",
      })),
    });

    await expect(
      reviews.submit({ actor: session("PATIENT"), requestId: "request-review-002" }, bookingId, {
        score: 4,
      }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("rejects a rating before laboratory service completion", async () => {
    const patientPrincipalId = createOpaqueId();
    const bookingId = createOpaqueId();
    const reviews = service({
      findEligibility: vi.fn(async () => ({
        bookingId,
        laboratoryOrganizationId: createOpaqueId(),
        patientId: createOpaqueId(),
        patientPrincipalId,
        status: "PROCESSING",
      })),
    });

    await expect(
      reviews.submit(
        { actor: session("PATIENT", patientPrincipalId), requestId: "request-review-003" },
        bookingId,
        { score: 1 },
      ),
    ).rejects.toMatchObject({ code: "service_not_completed", status: 409 });
  });

  it("scopes the completed-service list to the signed-in patient", async () => {
    const patientPrincipalId = createOpaqueId();
    const listForPatient = vi.fn(async () => ({ data: [] }));
    const reviews = service({ listForPatient });

    await reviews.listForPatient(
      { actor: session("PATIENT", patientPrincipalId), requestId: "request-review-004" },
      25,
    );

    expect(listForPatient).toHaveBeenCalledWith({ limit: 25, patientPrincipalId });
  });
});
