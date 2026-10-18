import type {
  CurrentSession,
  PatientProfileResponse,
  PractitionerSettingsResponse,
} from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountProfileConflictError,
  AccountProfileNotFoundError,
  AccountProfileService,
} from "../src/account-profile/application/account-profile.service.js";
import type { AccountProfileRepository } from "../src/account-profile/domain/account-profile.types.js";
import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

function actor(role: "PATIENT" | "PROVIDER"): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

const patient: PatientProfileResponse = {
  countryCode: "CA",
  dateOfBirth: "1990-01-01",
  emergencyContact: null,
  familyName: "Patient",
  givenName: "Synthetic",
  id: createOpaqueId(),
  phoneE164: "+14165550100",
  preferredLanguage: "en-CA",
  version: 1,
};
const practitioner: PractitionerSettingsResponse = {
  acceptingPatients: true,
  biography: null,
  displayName: "Synthetic Practitioner",
  headline: null,
  id: createOpaqueId(),
  languageTags: ["en"],
  primarySpecialty: "General Practice",
  verificationStatus: "VERIFIED",
  version: 1,
};

describe("AccountProfileService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = {
    findPatient: vi.fn(),
    findPractitioner: vi.fn(),
    updatePatient: vi.fn(),
    updatePractitioner: vi.fn(),
  } as unknown as AccountProfileRepository;
  const service = new AccountProfileService(
    { authorize } as unknown as AuthorizationService,
    repository,
  );

  beforeEach(() => vi.clearAllMocks());

  it("scopes patient and practitioner reads to the authenticated principal and role", async () => {
    const patientActor = actor("PATIENT");
    vi.mocked(repository.findPatient).mockResolvedValue(patient);
    await expect(
      service.getPatient({ actor: patientActor, requestId: "request-patient-profile" }),
    ).resolves.toEqual(patient);
    expect(repository.findPatient).toHaveBeenCalledWith(patientActor.principalId);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          ownerPrincipalId: patientActor.principalId,
          profileKind: "PATIENT",
        }),
      }),
    );

    const providerActor = actor("PROVIDER");
    vi.mocked(repository.findPractitioner).mockResolvedValue(practitioner);
    await service.getPractitioner({ actor: providerActor, requestId: "request-provider-profile" });
    expect(repository.findPractitioner).toHaveBeenCalledWith(providerActor.principalId);
  });

  it("keeps a missing profile distinct from an optimistic concurrency conflict", async () => {
    const patientActor = actor("PATIENT");
    const context = { actor: patientActor, requestId: "request-patient-update" };
    vi.mocked(repository.updatePatient).mockResolvedValue({ outcome: "NOT_FOUND" });
    await expect(
      service.updatePatient(context, {
        emergencyContact: null,
        expectedVersion: 1,
        preferredLanguage: "fr",
      }),
    ).rejects.toBeInstanceOf(AccountProfileNotFoundError);

    vi.mocked(repository.updatePatient).mockResolvedValue({ outcome: "VERSION_CONFLICT" });
    await expect(
      service.updatePatient(context, {
        emergencyContact: null,
        expectedVersion: 1,
        preferredLanguage: "fr",
      }),
    ).rejects.toBeInstanceOf(AccountProfileConflictError);
  });

  it("never accepts a caller-supplied owner identity", async () => {
    const patientActor = actor("PATIENT");
    vi.mocked(repository.updatePatient).mockResolvedValue({
      outcome: "UPDATED",
      profile: patient,
    });
    await service.updatePatient(
      { actor: patientActor, requestId: "request-patient-owner" },
      {
        emergencyContact: {
          displayName: "Emergency Contact",
          phoneE164: "+14165550101",
          relationship: "Friend",
        },
        expectedVersion: 1,
        preferredLanguage: "en-CA",
      },
    );
    expect(repository.updatePatient).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: patientActor.principalId,
        requestId: "request-patient-owner",
      }),
    );

    const providerActor = actor("PROVIDER");
    vi.mocked(repository.updatePractitioner).mockResolvedValue({
      outcome: "UPDATED",
      profile: practitioner,
    });
    await service.updatePractitioner(
      { actor: providerActor, requestId: "request-provider-update" },
      {
        acceptingPatients: true,
        biography: null,
        expectedVersion: 1,
        headline: null,
        languageTags: ["en"],
      },
    );
    expect(repository.updatePractitioner).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: providerActor.principalId }),
    );
  });
});
