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

  it("allows only administrators to read the privacy-minimized moderation queue", async () => {
    const listForModeration = vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    }));
    const reviews = service({ listForModeration });

    await reviews.listForModeration(
      { actor: session("ADMINISTRATOR"), requestId: "request-review-005" },
      { limit: 25, status: "PENDING" },
    );
    await expect(
      reviews.listForModeration(
        { actor: session("SUPPORT"), requestId: "request-review-006" },
        { limit: 25, status: "PENDING" },
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });

    expect(listForModeration).toHaveBeenCalledOnce();
    expect(listForModeration).toHaveBeenCalledWith({ limit: 25, status: "PENDING" });
  });

  it("records an administrator moderation decision with actor and expected version", async () => {
    const administrator = session("ADMINISTRATOR");
    const reviewId = createOpaqueId();
    const moderate = vi.fn(async () => ({
      comment: "Helpful staff.",
      commentStatus: "PUBLISHED" as const,
      id: reviewId,
      laboratory: { displayName: "Synthetic Laboratory", id: createOpaqueId() },
      moderatedAt: new Date().toISOString(),
      moderationReasonCode: null,
      score: 5,
      submittedAt: new Date().toISOString(),
      version: 2,
    }));
    const reviews = service({ moderate });

    await reviews.moderate({ actor: administrator, requestId: "request-review-007" }, reviewId, {
      decision: "PUBLISH",
      expectedVersion: 1,
    });

    expect(moderate).toHaveBeenCalledWith({
      actorPrincipalId: administrator.principalId,
      decision: "PUBLISH",
      expectedVersion: 1,
      requestId: "request-review-007",
      reviewId,
    });
  });

  it("denies non-administrators before executing or validating a moderation decision", async () => {
    const moderate = vi.fn();
    const reviews = service({ moderate });

    await expect(
      reviews.moderate(
        { actor: session("SUPPORT"), requestId: "request-review-008" },
        createOpaqueId(),
        { decision: "HIDE", expectedVersion: 1 },
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });

    expect(moderate).not.toHaveBeenCalled();
  });

  it("requires one controlled reason for hiding and forbids reasons when publishing", async () => {
    const moderate = vi.fn();
    const reviews = service({ moderate });
    const administrator = session("ADMINISTRATOR");
    const reviewId = createOpaqueId();

    await expect(
      reviews.moderate({ actor: administrator, requestId: "request-review-009" }, reviewId, {
        decision: "HIDE",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "invalid_moderation_reason", status: 400 });
    await expect(
      reviews.moderate({ actor: administrator, requestId: "request-review-010" }, reviewId, {
        decision: "PUBLISH",
        expectedVersion: 1,
        reasonCode: "SPAM_OR_FRAUD",
      }),
    ).rejects.toMatchObject({ code: "invalid_moderation_reason", status: 400 });

    expect(moderate).not.toHaveBeenCalled();
  });
});
