import type {
  CurrentSession,
  OnboardingApplicationData,
  PlatformRole,
} from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationDeniedError,
  AuthorizationService,
} from "../src/authorization/application/authorization.service.js";
import type { AuthorizationAuditRepository } from "../src/authorization/domain/authorization.types.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import {
  OnboardingFlowError,
  OnboardingService,
} from "../src/onboarding/application/onboarding.service.js";
import type {
  OnboardingRepository,
  StoredOnboardingApplication,
} from "../src/onboarding/domain/onboarding-repository.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const patientData: OnboardingApplicationData = {
  kind: "PATIENT",
  values: {
    countryCode: "GB",
    dateOfBirth: "1990-01-01",
    familyName: "Patient",
    givenName: "Example",
    phoneE164: "+442071838750",
    preferredLanguage: "en-GB",
  },
};

function session(role?: PlatformRole, principalId = createOpaqueId()): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: "2026-09-30T00:00:00.000Z",
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: role === undefined ? [] : [role],
    sessionId: createOpaqueId(),
  };
}

function application(
  applicantPrincipalId: string,
  status: StoredOnboardingApplication["status"] = "DRAFT",
): StoredOnboardingApplication {
  return {
    applicantPrincipalId,
    approvedResourceId: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    data: patientData,
    displayName: "Example Patient",
    documents: [],
    history: [],
    id: createOpaqueId(),
    kind: "PATIENT",
    status,
    submittedAt: status === "DRAFT" ? null : "2026-09-30T01:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    version: 3,
  };
}

function repository(record: StoredOnboardingApplication): OnboardingRepository {
  return {
    createApplication: vi.fn(async () => record),
    findApplicationById: vi.fn(async () => record),
    listApplications: vi.fn(async () => ({
      data: [record],
      pageInfo: { endCursor: null, hasNextPage: false },
    })),
    reserveDocument: vi.fn(),
    transitionApplication: vi.fn(async (input) => ({
      ...record,
      status: input.toStatus,
      version: record.version + 1,
    })),
    updateApplication: vi.fn(async () => record),
  };
}

function service(repo: OnboardingRepository) {
  const append = vi.fn<AuthorizationAuditRepository["append"]>(async () => undefined);
  return {
    append,
    onboarding: new OnboardingService(
      repo,
      new AuthorizationService(new PolicyEngine(), { append }),
    ),
  };
}

describe("OnboardingService", () => {
  it("allows an applicant to read their own record without internal repository fields", async () => {
    const applicant = session();
    const stored = application(applicant.principalId);
    const { onboarding } = service(repository(stored));

    const result = await onboarding.getOwnApplication(
      { actor: applicant, requestId: "request-1" },
      stored.id,
    );

    expect(result.id).toBe(stored.id);
    expect(result).not.toHaveProperty("applicantPrincipalId");
  });

  it("denies managers access to another applicant and audits the denial", async () => {
    const stored = application(createOpaqueId(), "SUBMITTED");
    const { append, onboarding } = service(repository(stored));

    await expect(
      onboarding.getOwnApplication(
        { actor: session("MANAGER"), requestId: "request-2" },
        stored.id,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ result: "DENIED" }));
  });

  it("lets support start review but never make a decision", async () => {
    const stored = application(createOpaqueId(), "SUBMITTED");
    const repo = repository(stored);
    const { onboarding } = service(repo);
    const support = session("SUPPORT");

    await expect(
      onboarding.startReview({ actor: support, requestId: "request-3" }, stored.id, stored.version),
    ).resolves.toMatchObject({ status: "UNDER_REVIEW" });
    await expect(
      onboarding.decide({ actor: support, requestId: "request-4" }, stored.id, {
        expectedVersion: stored.version,
        reasonCategory: "VERIFIED",
        toStatus: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("keeps unfinished drafts out of support and administrator review", async () => {
    const stored = application(createOpaqueId(), "DRAFT");
    const repo = repository(stored);
    const { onboarding } = service(repo);

    await expect(
      onboarding.getForReview(
        { actor: session("SUPPORT"), requestId: "request-draft" },
        stored.id,
        "REVIEW",
      ),
    ).rejects.toMatchObject({ code: "application_not_found" });
    await expect(
      onboarding.listForReview(
        { actor: session("ADMINISTRATOR"), requestId: "request-draft-list" },
        "DECIDE",
        {},
      ),
    ).resolves.toBeDefined();
    expect(repo.listApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"],
      }),
    );
  });

  it("requires applicant-facing notes for rejection and information requests", async () => {
    const stored = application(createOpaqueId(), "UNDER_REVIEW");
    const { onboarding } = service(repository(stored));
    await expect(
      onboarding.decide({ actor: session("ADMINISTRATOR"), requestId: "request-5" }, stored.id, {
        expectedVersion: stored.version,
        reasonCategory: "INSUFFICIENT_INFORMATION",
        toStatus: "REJECTED",
      }),
    ).rejects.toBeInstanceOf(OnboardingFlowError);
  });

  it("makes repeated terminal administrator decisions safe to retry", async () => {
    const stored = application(createOpaqueId(), "APPROVED");
    const repo = repository(stored);
    const { onboarding } = service(repo);

    await expect(
      onboarding.decide(
        { actor: session("ADMINISTRATOR"), requestId: "request-idempotent" },
        stored.id,
        {
          expectedVersion: stored.version - 1,
          reasonCategory: "ADMIN_VERIFIED",
          toStatus: "APPROVED",
        },
      ),
    ).resolves.toMatchObject({ id: stored.id, status: "APPROVED" });
    expect(repo.transitionApplication).not.toHaveBeenCalled();
  });

  it("refuses incomplete organization submission", async () => {
    const applicant = session();
    const stored: StoredOnboardingApplication = {
      ...application(applicant.principalId),
      data: {
        kind: "ORGANIZATION",
        values: {
          addressLine1: "1 Example Street",
          addressLine2: null,
          administrativeArea: "Greater London",
          contactEmail: "operator@example.test",
          contactName: "Example Operator",
          contactPhoneE164: null,
          countryCode: "GB",
          displayName: "Example Hospital",
          legalName: "Example Hospital Limited",
          locality: "London",
          organizationType: "HOSPITAL",
          postalCode: null,
          jurisdictionCode: "GB",
          registrationAuthority: "Synthetic Health Regulator",
          registrationNumber: "REG-EXAMPLE",
          serviceIds: [],
        },
      },
      kind: "ORGANIZATION",
    };
    const { onboarding } = service(repository(stored));
    await expect(
      onboarding.submitOwnApplication(
        { actor: applicant, requestId: "request-6" },
        stored.id,
        stored.version,
      ),
    ).rejects.toMatchObject({ code: "services_required" });
  });
});
