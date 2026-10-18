import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AccountProfileService } from "../src/account-profile/application/account-profile.service.js";
import { AccountProfileController } from "../src/account-profile/presentation/account-profile.controller.js";
import type { AuthenticatedInternalRequest } from "../src/identity/presentation/authenticated-internal-request.guard.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

function request(): AuthenticatedInternalRequest {
  return {
    currentSession: {
      absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
      assuranceContext: null,
      authenticatedAt: new Date().toISOString(),
      authenticationMethods: ["pwd"],
      idleExpiresAt: "2099-01-01T00:00:00.000Z",
      memberships: [],
      principalId: createOpaqueId(),
      roles: ["PROVIDER"],
      sessionId: createOpaqueId(),
    },
    headers: { "x-request-id": "request-profile-controller" },
  } as unknown as AuthenticatedInternalRequest;
}

describe("AccountProfileController", () => {
  it("rejects malformed BCP 47 language tags before persistence", async () => {
    const updatePatient = vi.fn();
    const controller = new AccountProfileController({
      updatePatient,
    } as unknown as AccountProfileService);

    await expect(
      controller.updatePatient(
        { expectedVersion: 1, preferredLanguage: "not_a_language" },
        request(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(updatePatient).not.toHaveBeenCalled();
  });

  it("canonicalizes and deduplicates practitioner language tags", async () => {
    const updatePractitioner = vi.fn().mockResolvedValue({});
    const controller = new AccountProfileController({
      updatePractitioner,
    } as unknown as AccountProfileService);

    await controller.updatePractitioner(
      {
        acceptingPatients: true,
        biography: null,
        expectedVersion: 1,
        headline: null,
        languageTags: ["EN-us", "en-US", "fr"],
      },
      request(),
    );
    expect(updatePractitioner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ languageTags: ["en-US", "fr"] }),
    );
  });
});
