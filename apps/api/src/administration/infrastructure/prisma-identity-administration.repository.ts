import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminPrincipalListItem,
  AdminPrincipalListResponse,
  PlatformRole,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  administrationFilterHash,
  encodeAdministrationCursor,
} from "../application/administration-cursor.js";
import type {
  IdentityAdministrationRepository,
  ListAdminPrincipalsQuery,
  TransitionAdminPrincipalResult,
} from "../domain/administration.types.js";

const PRINCIPAL_ADMINISTRATION_LOCK = "royal-palace:principal-administration";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const principalSelect = {
  createdAt: true,
  id: true,
  managerProfile: { select: { displayName: true } },
  memberships: {
    select: {
      roleAssignments: { select: { effectiveFrom: true, effectiveUntil: true, role: true } },
    },
  },
  notificationEndpoints: {
    orderBy: [{ verifiedAt: "desc" as const }, { id: "desc" as const }],
    select: { address: true },
    take: 1,
    // Recipient endpoints are only persisted after verification; invalidated addresses are excluded.
    where: { channel: "EMAIL" as const, invalidatedAt: null },
  },
  patient: { select: { familyName: true, givenName: true } },
  practitioner: { select: { displayName: true } },
  roleAssignments: {
    select: { effectiveFrom: true, effectiveUntil: true, role: true, scope: true },
  },
  status: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.IdentityPrincipalSelect;

type PrincipalRecord = Prisma.IdentityPrincipalGetPayload<{ select: typeof principalSelect }>;

@Injectable()
export class PrismaIdentityAdministrationRepository implements IdentityAdministrationRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async listPrincipals(query: ListAdminPrincipalsQuery): Promise<AdminPrincipalListResponse> {
    const now = new Date();
    const where = principalWhere(query, now);
    const [records, grouped] = await this.database.$transaction([
      this.database.identityPrincipal.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: principalSelect,
        take: query.limit + 1,
        where: {
          ...where,
          ...(query.cursor === undefined
            ? {}
            : {
                OR: [
                  { updatedAt: { lt: query.cursor.timestamp } },
                  { id: { lt: query.cursor.id }, updatedAt: query.cursor.timestamp },
                ],
              }),
        },
      }),
      this.database.identityPrincipal.groupBy({
        _count: { _all: true },
        by: ["status"],
        orderBy: { status: "asc" },
        where: principalWhere({ ...query, scope: "ALL" }, now),
      }),
    ]);
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const data = page.map((record) => mapPrincipal(record, now));
    const last = page.at(-1);
    const filterHash = administrationFilterHash({
      query: query.query,
      role: query.role,
      scope: query.scope,
    });
    const active = groupCount(grouped.find(({ status }) => status === "ACTIVE")?._count);
    const disabled = groupCount(grouped.find(({ status }) => status === "DISABLED")?._count);
    return {
      data,
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? encodeAdministrationCursor({ id: last.id, timestamp: last.updatedAt }, filterHash)
            : null,
        hasNextPage,
      },
      summary: { active, all: active + disabled, disabled },
    };
  }

  async transitionPrincipal(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    principalId: string;
    reason: string;
    requestId: string;
    status: "ACTIVE" | "DISABLED";
  }): Promise<TransitionAdminPrincipalResult> {
    return this.database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${PRINCIPAL_ADMINISTRATION_LOCK}))`;
        const current = await transaction.identityPrincipal.findUnique({
          select: {
            id: true,
            roleAssignments: {
              select: { effectiveFrom: true, effectiveUntil: true, role: true, scope: true },
            },
            status: true,
            version: true,
          },
          where: { id: input.principalId },
        });
        if (current === null) return { outcome: "NOT_FOUND" };
        if (current.version !== input.expectedVersion) return { outcome: "VERSION_CONFLICT" };
        if (current.status === input.status) return { outcome: "NO_CHANGE" };
        if (input.principalId === input.actorPrincipalId && input.status === "DISABLED") {
          return { outcome: "SELF_DISABLE" };
        }
        const now = new Date();
        if (
          current.status === "ACTIVE" &&
          input.status === "DISABLED" &&
          activePlatformRoles(current.roleAssignments, now).includes("ADMINISTRATOR")
        ) {
          const administratorCount = await transaction.identityPrincipal.count({
            where: {
              roleAssignments: {
                some: {
                  effectiveFrom: { lte: now },
                  OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
                  role: "ADMINISTRATOR",
                  scope: "PLATFORM",
                },
              },
              status: "ACTIVE",
            },
          });
          if (administratorCount <= 1) return { outcome: "LAST_ADMINISTRATOR" };
        }
        const changed = await transaction.identityPrincipal.updateMany({
          data: { status: input.status, version: { increment: 1 } },
          where: { id: input.principalId, version: input.expectedVersion },
        });
        if (changed.count !== 1) return { outcome: "VERSION_CONFLICT" };
        if (input.status === "DISABLED") {
          await transaction.authSession.updateMany({
            data: {
              revocationReason: "PRINCIPAL_DISABLED",
              revokedAt: now,
              status: "REVOKED",
              version: { increment: 1 },
            },
            where: { principalId: input.principalId, status: "ACTIVE" },
          });
        }
        await transaction.auditEvent.create({
          data: {
            action: "identity.principal.status_changed",
            actorPrincipalId: input.actorPrincipalId,
            effectiveRole: "ADMINISTRATOR",
            id: createOpaqueId(),
            metadata: {
              fromStatus: current.status,
              reason: input.reason,
              toStatus: input.status,
            },
            occurredAt: now,
            reasonCode: "administrative_status_change",
            requestId: input.requestId,
            resourceId: input.principalId,
            resourceType: "identity_principal",
            result: "SUCCEEDED",
          },
        });
        const updated = await transaction.identityPrincipal.findUniqueOrThrow({
          select: principalSelect,
          where: { id: input.principalId },
        });
        return { outcome: "UPDATED", principal: mapPrincipal(updated, now) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function groupCount(
  count:
    | true
    | number
    | {
        _all?: number;
        createdAt?: number;
        id?: number;
        status?: number;
        updatedAt?: number;
        version?: number;
      }
    | undefined,
): number {
  return typeof count === "object" ? (count._all ?? 0) : typeof count === "number" ? count : 0;
}

function principalWhere(
  query: ListAdminPrincipalsQuery,
  now: Date,
): Prisma.IdentityPrincipalWhereInput {
  const text = query.query?.trim();
  const identityMatch = text !== undefined && UUID_PATTERN.test(text) ? [{ id: text }] : [];
  return {
    ...(query.scope === "ALL" ? {} : { status: query.scope }),
    ...(query.role === undefined
      ? {}
      : {
          OR: [
            {
              roleAssignments: {
                some: activeRoleWhere(query.role, "PLATFORM", now),
              },
            },
            {
              memberships: {
                some: {
                  effectiveFrom: { lte: now },
                  OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
                  roleAssignments: { some: activeRoleWhere(query.role, "ORGANIZATION", now) },
                },
              },
            },
          ],
        }),
    ...(text === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                ...identityMatch,
                { managerProfile: { displayName: { contains: text, mode: "insensitive" } } },
                {
                  notificationEndpoints: {
                    some: {
                      normalizedAddress: { contains: text.toLowerCase(), mode: "insensitive" },
                      channel: "EMAIL",
                      invalidatedAt: null,
                    },
                  },
                },
                { patient: { familyName: { contains: text, mode: "insensitive" } } },
                { patient: { givenName: { contains: text, mode: "insensitive" } } },
                { practitioner: { displayName: { contains: text, mode: "insensitive" } } },
              ],
            },
          ],
        }),
  };
}

function activeRoleWhere(
  role: PlatformRole,
  scope: "PLATFORM" | "ORGANIZATION",
  now: Date,
): Prisma.RoleAssignmentWhereInput {
  return {
    effectiveFrom: { lte: now },
    OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
    role,
    scope,
  };
}

function activePlatformRoles(
  assignments: readonly {
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    role: PlatformRole;
    scope: "PLATFORM" | "ORGANIZATION";
  }[],
  now: Date,
): PlatformRole[] {
  return assignments
    .filter(
      (assignment) =>
        assignment.scope === "PLATFORM" &&
        assignment.effectiveFrom <= now &&
        (assignment.effectiveUntil === null || assignment.effectiveUntil > now),
    )
    .map(({ role }) => role);
}

function mapPrincipal(record: PrincipalRecord, now: Date): AdminPrincipalListItem {
  const platformRoles = activePlatformRoles(record.roleAssignments, now);
  const membershipRoles = record.memberships.flatMap(({ roleAssignments }) =>
    roleAssignments
      .filter(
        ({ effectiveFrom, effectiveUntil }) =>
          effectiveFrom <= now && (effectiveUntil === null || effectiveUntil > now),
      )
      .map(({ role }) => role),
  );
  const email = record.notificationEndpoints[0]?.address ?? null;
  return {
    createdAt: record.createdAt.toISOString(),
    displayName:
      record.practitioner?.displayName ??
      (record.patient === null
        ? null
        : `${record.patient.givenName} ${record.patient.familyName}`.trim()) ??
      record.managerProfile?.displayName ??
      email ??
      `Account ${record.id.slice(0, 8)}`,
    email,
    id: record.id,
    roles: [...new Set([...platformRoles, ...membershipRoles])].sort(),
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}
