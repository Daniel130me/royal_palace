import type { OnboardingApplicationData } from "@royal-palace/contracts";
import { issueReferralToken } from "@royal-palace/security";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidReferralClaimError,
  ReferralClaimService,
} from "../src/manager/application/referral-claim.service.js";
import type {
  ManagerRepository,
  StoredReferralLinkForClaim,
} from "../src/manager/domain/manager-repository.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

const patientApplication: OnboardingApplicationData = {
  kind: "PATIENT",
  values: {
    countryCode: null,
    dateOfBirth: null,
    familyName: "Applicant",
    givenName: "Synthetic",
    phoneE164: null,
    preferredLanguage: null,
  },
};

function link(overrides: Partial<StoredReferralLinkForClaim> = {}): StoredReferralLinkForClaim {
  return {
    audience: "PATIENT",
    id: createOpaqueId(),
    label: "Patient referral",
    managerProfileId: createOpaqueId(),
    managerStatus: "ACTIVE",
    organizationType: null,
    signingKeyId: testConfig.identity.referralActiveSigningKeyId,
    status: "ACTIVE",
    tokenVersion: 1,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: null,
    ...overrides,
  };
}

describe("ReferralClaimService", () => {
  it("resolves only an active purpose-matched referral", async () => {
    const record = link();
    const repository = {
      findReferralLinkForClaim: vi.fn(async () => record),
    } as unknown as ManagerRepository;
    const service = new ReferralClaimService(repository, testConfig);
    const key = testConfig.identity.referralSigningKeys[record.signingKeyId];
    if (key === undefined) throw new Error("Test key is missing");
    const token = issueReferralToken(
      { keyId: record.signingKeyId, linkId: record.id, tokenVersion: record.tokenVersion },
      key,
    );

    await expect(
      service.resolve(token, patientApplication, new Date("2026-09-30T00:00:00.000Z")),
    ).resolves.toEqual({ linkId: record.id, managerProfileId: record.managerProfileId });
  });

  it.each([
    { audience: "ORGANIZATION" as const },
    { status: "REVOKED" as const },
    { validUntil: new Date("2026-01-02T00:00:00.000Z") },
    { managerStatus: "SUSPENDED" as const },
  ])("fails closed without revealing why a referral is unavailable", async (override) => {
    const record = link(override);
    const service = new ReferralClaimService(
      { findReferralLinkForClaim: vi.fn(async () => record) } as unknown as ManagerRepository,
      testConfig,
    );
    const key = testConfig.identity.referralSigningKeys[record.signingKeyId];
    if (key === undefined) throw new Error("Test key is missing");
    const token = issueReferralToken(
      { keyId: record.signingKeyId, linkId: record.id, tokenVersion: record.tokenVersion },
      key,
    );

    await expect(
      service.resolve(token, patientApplication, new Date("2026-09-30T00:00:00.000Z")),
    ).rejects.toBeInstanceOf(InvalidReferralClaimError);
  });
});
