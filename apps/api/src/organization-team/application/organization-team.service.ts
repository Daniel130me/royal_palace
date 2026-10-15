import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import { randomSecret, sha256Hex } from "@royal-palace/security";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  ORGANIZATION_TEAM_REPOSITORY,
  type OrganizationTeamRepository,
} from "../domain/organization-team.types.js";

export class OrganizationTeamFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationTeamFlowError";
  }
}

type RequestContext = { actor: CurrentSession; requestId: string };

@Injectable()
export class OrganizationTeamService {
  constructor(
    @Inject(ORGANIZATION_TEAM_REPOSITORY)
    private readonly repository: OrganizationTeamRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async getTeam(context: RequestContext, organizationId: string) {
    await this.authorizeAdministrator(context, organizationId);
    const team = await this.repository.getTeam(organizationId);
    if (team === null) {
      throw new OrganizationTeamFlowError("organization_not_found", 404, "Organization not found");
    }
    return team;
  }

  async createInvitation(context: RequestContext, organizationId: string) {
    await this.authorizeAdministrator(context, organizationId);
    this.assertPrivilegedAssurance(context.actor);
    const token = randomSecret(32);
    const invitation = await this.repository.createInvitation({
      createdByPrincipalId: context.actor.principalId,
      effectiveRole: this.administrativeRole(context.actor),
      expiresAt: new Date(Date.now() + this.config.organizationTeam.invitationTtlSeconds * 1000),
      id: createOpaqueId(),
      organizationId,
      requestId: context.requestId,
      tokenDigest: sha256Hex(token),
    });
    return { invitation, token };
  }

  async revokeInvitation(
    context: RequestContext,
    input: { expectedVersion: number; invitationId: string; organizationId: string },
  ) {
    await this.authorizeAdministrator(context, input.organizationId);
    this.assertPrivilegedAssurance(context.actor);
    const updated = await this.repository.revokeInvitation({
      ...input,
      actorPrincipalId: context.actor.principalId,
      effectiveRole: this.administrativeRole(context.actor),
      requestId: context.requestId,
    });
    if (!updated) {
      throw new OrganizationTeamFlowError(
        "invitation_conflict",
        409,
        "Invitation changed or is no longer pending",
      );
    }
    return { revoked: true as const };
  }

  async deactivateMember(
    context: RequestContext,
    input: { expectedVersion: number; membershipId: string; organizationId: string },
  ) {
    await this.authorizeAdministrator(context, input.organizationId);
    this.assertPrivilegedAssurance(context.actor);
    const result = await this.repository.deactivateMember({
      ...input,
      actorPrincipalId: context.actor.principalId,
      effectiveRole: this.administrativeRole(context.actor),
      requestId: context.requestId,
    });
    if (result === "ADMIN") {
      throw new OrganizationTeamFlowError(
        "administrator_deactivation_forbidden",
        409,
        "Organization administrators cannot be deactivated through the staff workflow",
      );
    }
    if (result === "NOT_FOUND") {
      throw new OrganizationTeamFlowError(
        "membership_conflict",
        409,
        "Membership changed or is no longer active",
      );
    }
    return { deactivated: true as const };
  }

  async acceptInvitation(context: RequestContext, token: string) {
    const result = await this.repository.acceptInvitation({
      acceptedByPrincipalId: context.actor.principalId,
      requestId: context.requestId,
      tokenDigest: sha256Hex(token),
    });
    if (result === "EXPIRED") {
      throw new OrganizationTeamFlowError("invitation_expired", 410, "Invitation has expired");
    }
    if (result === "UNAVAILABLE") {
      throw new OrganizationTeamFlowError(
        "invitation_unavailable",
        404,
        "Invitation is invalid or no longer available",
      );
    }
    return result;
  }

  private async authorizeAdministrator(context: RequestContext, organizationId: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: organizationId, resourceType: "organization_team" },
      policy: AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM,
      requestId: context.requestId,
    });
  }

  private assertPrivilegedAssurance(session: CurrentSession) {
    const age = Date.now() - new Date(session.authenticatedAt).getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new OrganizationTeamFlowError(
        "step_up_required",
        403,
        "Step-up authentication is required",
      );
    }
  }

  private administrativeRole(session: CurrentSession) {
    return session.roles.includes("ADMINISTRATOR") ? "ADMINISTRATOR" : "ORGANIZATION_ADMIN";
  }
}
