import type { CurrentSession, LaboratoryWorkspaceResponse } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import {
  LaboratoryWorkspaceNotFoundError,
  LaboratoryWorkspaceService,
} from "../src/laboratory/application/laboratory-workspace.service.js";
import type { LaboratoryWorkspaceRepository } from "../src/laboratory/domain/laboratory-workspace.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const organizationId = createOpaqueId();
const actor: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: "urn:royal-palace:aal2",
  authenticatedAt: new Date().toISOString(),
  authenticationMethods: ["pwd", "otp"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [{ organizationId, organizationType: "LABORATORY", roles: ["ORGANIZATION_STAFF"] }],
  principalId: createOpaqueId(),
  roles: [],
  sessionId: createOpaqueId(),
};
const workspace: LaboratoryWorkspaceResponse = {
  organization: {
    displayName: "Synthetic Laboratory",
    id: organizationId,
    legalName: "Synthetic Laboratory Incorporated",
    publicPhone: null,
    verificationStatus: "VERIFIED",
    websiteUrl: null,
  },
  primaryLocation: null,
  rating: { averageScore: null, reviewCount: 0 },
  registration: null,
  services: [],
};

describe("LaboratoryWorkspaceService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = { find: vi.fn() } as unknown as LaboratoryWorkspaceRepository;
  const service = new LaboratoryWorkspaceService(
    { authorize } as unknown as AuthorizationService,
    repository,
  );

  beforeEach(() => vi.clearAllMocks());

  it("authorizes the exact organization before reading the workspace", async () => {
    vi.mocked(repository.find).mockResolvedValue(workspace);

    await expect(
      service.get({ actor, requestId: "request-workspace-001" }, organizationId),
    ).resolves.toEqual(workspace);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ organizationId }),
        policy: "VIEW_ORGANIZATION",
      }),
    );
  });

  it("does not disguise a missing laboratory as an empty profile", async () => {
    vi.mocked(repository.find).mockResolvedValue(null);

    await expect(
      service.get({ actor, requestId: "request-workspace-002" }, organizationId),
    ).rejects.toBeInstanceOf(LaboratoryWorkspaceNotFoundError);
  });
});
