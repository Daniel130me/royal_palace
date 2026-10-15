import type {
  AcceptOrganizationTeamInvitationResponse,
  OrganizationTeamResponse,
} from "@royal-palace/contracts";
import type { PlatformRole } from "@royal-palace/contracts";

export const ORGANIZATION_TEAM_REPOSITORY = Symbol("ORGANIZATION_TEAM_REPOSITORY");

export interface OrganizationTeamRepository {
  acceptInvitation(input: {
    acceptedByPrincipalId: string;
    requestId: string;
    tokenDigest: string;
  }): Promise<AcceptOrganizationTeamInvitationResponse | "EXPIRED" | "UNAVAILABLE">;
  createInvitation(input: {
    createdByPrincipalId: string;
    effectiveRole: PlatformRole;
    expiresAt: Date;
    id: string;
    organizationId: string;
    requestId: string;
    tokenDigest: string;
  }): Promise<OrganizationTeamResponse["invitations"][number]>;
  deactivateMember(input: {
    actorPrincipalId: string;
    effectiveRole: PlatformRole;
    expectedVersion: number;
    membershipId: string;
    organizationId: string;
    requestId: string;
  }): Promise<"ADMIN" | "NOT_FOUND" | "UPDATED">;
  getTeam(organizationId: string): Promise<OrganizationTeamResponse | null>;
  revokeInvitation(input: {
    actorPrincipalId: string;
    effectiveRole: PlatformRole;
    expectedVersion: number;
    invitationId: string;
    organizationId: string;
    requestId: string;
  }): Promise<boolean>;
}
