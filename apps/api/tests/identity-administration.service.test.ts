import type { AdminPrincipalListItem, CurrentSession } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdministrationFlowError } from "../src/administration/application/administration.service.js";
import { IdentityAdministrationService } from "../src/administration/application/identity-administration.service.js";
import type { IdentityAdministrationRepository } from "../src/administration/domain/administration.types.js";
import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const actor: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: "urn:royal-palace:aal2",
  authenticatedAt: new Date().toISOString(),
  authenticationMethods: ["pwd", "otp"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [],
  principalId: createOpaqueId(),
  roles: ["ADMINISTRATOR"],
  sessionId: createOpaqueId(),
};
const principal: AdminPrincipalListItem = {
  createdAt: new Date().toISOString(),
  displayName: "Synthetic Patient",
  email: "patient@example.test",
  id: createOpaqueId(),
  roles: ["PATIENT"],
  status: "DISABLED",
  updatedAt: new Date().toISOString(),
  version: 2,
};

describe("IdentityAdministrationService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = {
    listPrincipals: vi.fn(),
    transitionPrincipal: vi.fn(),
  } as unknown as IdentityAdministrationRepository;
  const service = new IdentityAdministrationService(
    { authorize } as unknown as AuthorizationService,
    repository,
  );
  const context = { actor, requestId: "request-principal-administration" };

  beforeEach(() => vi.clearAllMocks());

  it("authorizes and forwards only bounded server-side filters", async () => {
    vi.mocked(repository.listPrincipals).mockResolvedValue({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { active: 0, all: 0, disabled: 0 },
    });
    await service.list(context, {
      limit: 50,
      query: "synthetic",
      role: "PATIENT",
      scope: "ACTIVE",
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ policy: "ADMINISTER_IDENTITY_PRINCIPALS" }),
    );
    expect(repository.listPrincipals).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, query: "synthetic", role: "PATIENT", scope: "ACTIVE" }),
    );
  });

  it.each([
    ["LAST_ADMINISTRATOR", "last_administrator_required"],
    ["NO_CHANGE", "principal_status_unchanged"],
    ["NOT_FOUND", "principal_not_found"],
    ["SELF_DISABLE", "administrator_self_disable_forbidden"],
    ["VERSION_CONFLICT", "principal_version_conflict"],
  ] as const)("maps %s to a stable safe error", async (outcome, code) => {
    vi.mocked(repository.transitionPrincipal).mockResolvedValue({ outcome });
    await expect(
      service.transition(context, principal.id, {
        expectedVersion: 1,
        reason: "Administrative security review",
        status: "DISABLED",
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<AdministrationFlowError>>({ code }));
  });

  it("binds the administrator and request evidence to the transition", async () => {
    vi.mocked(repository.transitionPrincipal).mockResolvedValue({ outcome: "UPDATED", principal });
    await service.transition(context, principal.id, {
      expectedVersion: 1,
      reason: "Administrative security review",
      status: "DISABLED",
    });
    expect(repository.transitionPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPrincipalId: actor.principalId,
        principalId: principal.id,
        requestId: context.requestId,
      }),
    );
  });
});
