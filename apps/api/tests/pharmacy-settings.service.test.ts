import type { CurrentSession, PharmacyOperationalSettingsResponse } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import {
  PharmacySettingsConflictError,
  PharmacySettingsNotFoundError,
  PharmacySettingsService,
} from "../src/pharmacy/application/pharmacy-settings.service.js";
import type { PharmacySettingsRepository } from "../src/pharmacy/domain/pharmacy-settings.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const organizationId = createOpaqueId();
const principalId = createOpaqueId();
const actor: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: "urn:royal-palace:aal2",
  authenticatedAt: new Date().toISOString(),
  authenticationMethods: ["pwd", "otp"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [{ organizationId, organizationType: "PHARMACY", roles: ["ORGANIZATION_STAFF"] }],
  principalId,
  roles: [],
  sessionId: createOpaqueId(),
};
const settings: PharmacyOperationalSettingsResponse = {
  deliveryEnabled: false,
  organization: {
    displayName: "Synthetic Pharmacy",
    id: organizationId,
    publicPhone: null,
    verificationStatus: "VERIFIED",
    websiteUrl: null,
  },
  pickupEnabled: true,
  preparationTargetMinutes: 60,
  updatedAt: new Date().toISOString(),
  version: 1,
};

describe("PharmacySettingsService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = { find: vi.fn(), update: vi.fn() } as unknown as PharmacySettingsRepository;
  const service = new PharmacySettingsService(
    { authorize } as unknown as AuthorizationService,
    repository,
  );
  const context = { actor, requestId: "request-settings-001" };

  beforeEach(() => vi.clearAllMocks());

  it("authorizes settings access against the requested pharmacy", async () => {
    vi.mocked(repository.find).mockResolvedValue(settings);
    await expect(service.get(context, organizationId)).resolves.toEqual(settings);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ organizationId }),
        policy: "MANAGE_PHARMACY_SETTINGS",
      }),
    );
  });

  it("keeps a missing pharmacy distinct from an optimistic concurrency conflict", async () => {
    vi.mocked(repository.update).mockResolvedValue({ outcome: "NOT_FOUND" });
    await expect(
      service.update(context, organizationId, {
        deliveryEnabled: false,
        expectedVersion: 0,
        pickupEnabled: true,
        preparationTargetMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(PharmacySettingsNotFoundError);

    vi.mocked(repository.update).mockResolvedValue({ outcome: "VERSION_CONFLICT" });
    await expect(
      service.update(context, organizationId, {
        deliveryEnabled: true,
        expectedVersion: 1,
        pickupEnabled: true,
        preparationTargetMinutes: 45,
      }),
    ).rejects.toBeInstanceOf(PharmacySettingsConflictError);
  });

  it("adds the authenticated principal to the settings audit evidence", async () => {
    vi.mocked(repository.update).mockResolvedValue({ outcome: "UPDATED", settings });
    await service.update(context, organizationId, {
      deliveryEnabled: false,
      expectedVersion: 1,
      pickupEnabled: true,
      preparationTargetMinutes: 60,
    });
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, principalId }),
    );
  });
});
