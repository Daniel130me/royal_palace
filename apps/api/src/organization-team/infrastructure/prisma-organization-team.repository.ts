import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PlatformRole } from "@royal-palace/contracts";

import { createOpaqueId } from "../../platform/identifiers.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type { OrganizationTeamRepository } from "../domain/organization-team.types.js";

const TEAM_LIST_LIMIT = 100;
const INVITATION_LIST_LIMIT = 50;

@Injectable()
export class PrismaOrganizationTeamRepository implements OrganizationTeamRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getTeam(organizationId: string) {
    const [organization, invitations] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          displayName: true,
          id: true,
          memberships: {
            where: { effectiveUntil: null },
            orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
            take: TEAM_LIST_LIMIT,
            select: {
              effectiveFrom: true,
              id: true,
              principalId: true,
              roleAssignments: {
                where: { effectiveUntil: null, scope: "ORGANIZATION" },
                orderBy: [{ role: "asc" }, { id: "asc" }],
                select: { role: true },
              },
              version: true,
            },
          },
          type: true,
        },
      }),
      this.prisma.organizationTeamInvitation.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: INVITATION_LIST_LIMIT,
        select: invitationSelect,
      }),
    ]);
    if (organization === null) return null;
    return {
      invitations: invitations.map(projectInvitation),
      members: organization.memberships.map((membership) => ({
        effectiveFrom: membership.effectiveFrom.toISOString(),
        id: membership.id,
        principalId: membership.principalId,
        roles: membership.roleAssignments.map(({ role }) => role),
        version: membership.version,
      })),
      organization: {
        displayName: organization.displayName,
        id: organization.id,
        type: organization.type,
      },
    };
  }

  async createInvitation(input: {
    createdByPrincipalId: string;
    effectiveRole: PlatformRole;
    expiresAt: Date;
    id: string;
    organizationId: string;
    requestId: string;
    tokenDigest: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.organizationTeamInvitation.create({
        data: {
          createdByPrincipalId: input.createdByPrincipalId,
          expiresAt: input.expiresAt,
          id: input.id,
          organizationId: input.organizationId,
          role: "ORGANIZATION_STAFF",
          tokenDigest: input.tokenDigest,
        },
        select: invitationSelect,
      });
      await transaction.auditEvent.create({
        data: {
          action: "organization_team.invitation_created",
          actorPrincipalId: input.createdByPrincipalId,
          effectiveRole: input.effectiveRole,
          id: createOpaqueId(),
          organizationId: input.organizationId,
          requestId: input.requestId,
          resourceId: input.id,
          resourceType: "organization_team_invitation",
          result: "SUCCEEDED",
        },
      });
      return projectInvitation(invitation);
    });
  }

  async revokeInvitation(input: {
    actorPrincipalId: string;
    effectiveRole: PlatformRole;
    expectedVersion: number;
    invitationId: string;
    organizationId: string;
    requestId: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.organizationTeamInvitation.updateMany({
        where: {
          id: input.invitationId,
          organizationId: input.organizationId,
          status: "PENDING",
          version: input.expectedVersion,
        },
        data: { revokedAt: new Date(), status: "REVOKED", version: { increment: 1 } },
      });
      if (updated.count !== 1) return false;
      await transaction.auditEvent.create({
        data: {
          action: "organization_team.invitation_revoked",
          actorPrincipalId: input.actorPrincipalId,
          effectiveRole: input.effectiveRole,
          id: createOpaqueId(),
          organizationId: input.organizationId,
          requestId: input.requestId,
          resourceId: input.invitationId,
          resourceType: "organization_team_invitation",
          result: "SUCCEEDED",
        },
      });
      return true;
    });
  }

  async deactivateMember(input: {
    actorPrincipalId: string;
    effectiveRole: PlatformRole;
    expectedVersion: number;
    membershipId: string;
    organizationId: string;
    requestId: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.membership.findFirst({
        where: {
          effectiveUntil: null,
          id: input.membershipId,
          organizationId: input.organizationId,
          version: input.expectedVersion,
        },
        select: {
          principalId: true,
          roleAssignments: {
            where: { effectiveUntil: null, role: "ORGANIZATION_ADMIN" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (membership === null || membership.principalId === input.actorPrincipalId) {
        return "NOT_FOUND" as const;
      }
      if (membership.roleAssignments.length > 0) return "ADMIN" as const;

      const now = new Date();
      const updated = await transaction.membership.updateMany({
        where: {
          effectiveUntil: null,
          id: input.membershipId,
          organizationId: input.organizationId,
          version: input.expectedVersion,
        },
        data: { effectiveUntil: now, version: { increment: 1 } },
      });
      if (updated.count !== 1) return "NOT_FOUND" as const;
      await transaction.roleAssignment.updateMany({
        where: { effectiveUntil: null, membershipId: input.membershipId },
        data: { effectiveUntil: now, version: { increment: 1 } },
      });
      await transaction.auditEvent.create({
        data: {
          action: "organization_team.member_deactivated",
          actorPrincipalId: input.actorPrincipalId,
          effectiveRole: input.effectiveRole,
          id: createOpaqueId(),
          organizationId: input.organizationId,
          requestId: input.requestId,
          resourceId: input.membershipId,
          resourceType: "membership",
          result: "SUCCEEDED",
        },
      });
      return "UPDATED" as const;
    });
  }

  async acceptInvitation(input: {
    acceptedByPrincipalId: string;
    requestId: string;
    tokenDigest: string;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [invitation] = await transaction.$queryRaw<
          Array<{
            expires_at: Date;
            created_by_principal_id: string;
            id: string;
            organization_id: string;
            status: "ACCEPTED" | "PENDING" | "REVOKED";
          }>
        >(Prisma.sql`
          SELECT "id", "organization_id", "status", "expires_at", "created_by_principal_id"
          FROM "organization_team_invitations"
          WHERE "token_digest" = ${input.tokenDigest}
          FOR UPDATE
        `);
        if (invitation === undefined || invitation.status !== "PENDING") return "UNAVAILABLE";
        if (invitation.expires_at <= new Date()) return "EXPIRED";

        // Different valid invitations could be accepted concurrently by the same
        // principal. Serialize that organization/principal key before checking the
        // partial active-membership uniqueness constraint to avoid a race-dependent
        // 500 while preserving the database constraint as the final guard.
        await transaction.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${invitation.organization_id}:${input.acceptedByPrincipalId}`}, 0)
          )
        `);

        let membership = await transaction.membership.findFirst({
          where: {
            effectiveUntil: null,
            organizationId: invitation.organization_id,
            principalId: input.acceptedByPrincipalId,
          },
          select: { id: true },
        });
        membership ??= await transaction.membership.create({
          data: {
            id: createOpaqueId(),
            organizationId: invitation.organization_id,
            principalId: input.acceptedByPrincipalId,
          },
          select: { id: true },
        });

        const existingRole = await transaction.roleAssignment.findFirst({
          where: {
            effectiveUntil: null,
            membershipId: membership.id,
            role: "ORGANIZATION_STAFF",
          },
          select: { id: true },
        });
        if (existingRole === null) {
          await transaction.roleAssignment.create({
            data: {
              grantedByPrincipalId: invitation.created_by_principal_id,
              id: createOpaqueId(),
              membershipId: membership.id,
              role: "ORGANIZATION_STAFF",
              scope: "ORGANIZATION",
            },
          });
        }

        const now = new Date();
        await transaction.organizationTeamInvitation.update({
          where: { id: invitation.id },
          data: {
            acceptedAt: now,
            acceptedByPrincipalId: input.acceptedByPrincipalId,
            acceptedMembershipId: membership.id,
            status: "ACCEPTED",
            version: { increment: 1 },
          },
        });
        await transaction.auditEvent.create({
          data: {
            action: "organization_team.invitation_accepted",
            actorPrincipalId: input.acceptedByPrincipalId,
            effectiveRole: "ORGANIZATION_STAFF",
            id: createOpaqueId(),
            organizationId: invitation.organization_id,
            requestId: input.requestId,
            resourceId: invitation.id,
            resourceType: "organization_team_invitation",
            result: "SUCCEEDED",
          },
        });
        const organization = await transaction.organization.findUniqueOrThrow({
          where: { id: invitation.organization_id },
          select: { displayName: true, id: true, type: true },
        });
        return { membershipId: membership.id, organization };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

const invitationSelect = {
  createdAt: true,
  expiresAt: true,
  id: true,
  role: true,
  status: true,
  version: true,
} as const;

function projectInvitation(invitation: {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  role: string;
  status: "ACCEPTED" | "PENDING" | "REVOKED";
  version: number;
}) {
  return {
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    id: invitation.id,
    role: "ORGANIZATION_STAFF" as const,
    status: invitation.status,
    version: invitation.version,
  };
}
