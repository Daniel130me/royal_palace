import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { OrganizationTeamService } from "../src/organization-team/application/organization-team.service.js";
import type { OrganizationTeamRepository } from "../src/organization-team/domain/organization-team.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const organizationId = createOpaqueId();
const principalId = createOpaqueId();

function session(
  input: { assurance?: string | null; authenticatedAt?: string } = {},
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: input.assurance ?? "mfa",
    authenticatedAt: input.authenticatedAt ?? new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [
      {
        organizationId,
        organizationType: "LABORATORY",
        roles: ["ORGANIZATION_ADMIN", "ORGANIZATION_STAFF"],
      },
    ],
    principalId,
    roles: [],
    sessionId: createOpaqueId(),
  };
}

function setup() {
  const invitation = {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: createOpaqueId(),
    role: "ORGANIZATION_STAFF" as const,
    status: "PENDING" as const,
    version: 1,
  };
  const repository = {
    acceptInvitation: vi.fn(),
    createInvitation: vi.fn().mockResolvedValue(invitation),
    deactivateMember: vi.fn(),
    getTeam: vi.fn(),
    revokeInvitation: vi.fn(),
  } satisfies OrganizationTeamRepository;
  const authorization = { authorize: vi.fn().mockResolvedValue({ allowed: true }) };
  const config = {
    identity: { privilegedAssuranceContext: "mfa", privilegedAuthMaxAgeSeconds: 600 },
    organizationTeam: { invitationTtlSeconds: 3_600 },
  } as ApiServiceConfig;
  const service = new OrganizationTeamService(
    repository,
    authorization as unknown as AuthorizationService,
    config,
  );
  return { authorization, invitation, repository, service };
}

describe("OrganizationTeamService", () => {
  it("returns a one-time raw token while persisting only its digest", async () => {
    const { repository, service } = setup();
    const response = await service.createInvitation(
      { actor: session(), requestId: "request-team-invite" },
      organizationId,
    );

    expect(response.token.length).toBeGreaterThanOrEqual(40);
    expect(repository.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByPrincipalId: principalId,
        effectiveRole: "ORGANIZATION_ADMIN",
        organizationId,
        tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(repository.createInvitation.mock.calls[0]?.[0].tokenDigest).not.toBe(response.token);
  });

  it("fails closed before persistence when privileged assurance is stale", async () => {
    const { repository, service } = setup();
    await expect(
      service.createInvitation(
        {
          actor: session({ authenticatedAt: "2020-01-01T00:00:00.000Z" }),
          requestId: "request-stale-assurance",
        },
        organizationId,
      ),
    ).rejects.toMatchObject({ code: "step_up_required" });
    expect(repository.createInvitation).not.toHaveBeenCalled();
  });

  it("accepts invitations by digest without requiring organization-admin authority", async () => {
    const { authorization, repository, service } = setup();
    repository.acceptInvitation.mockResolvedValue({
      membershipId: createOpaqueId(),
      organization: {
        displayName: "Synthetic Diagnostics",
        id: organizationId,
        type: "LABORATORY",
      },
    });

    await service.acceptInvitation(
      { actor: { ...session(), memberships: [], roles: [] }, requestId: "request-accept" },
      "invitation-secret-value-with-enough-entropy",
    );

    expect(authorization.authorize).not.toHaveBeenCalled();
    expect(repository.acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });
});
