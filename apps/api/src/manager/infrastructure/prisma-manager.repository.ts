import { Inject, Injectable } from "@nestjs/common";
import type {
  CommissionPolicyResponse,
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralStatusResponse,
  ManagerTicketCategory,
  ManagerTicketResponse,
  PatientActivityType,
  PublicOrganizationType,
  ReferralAudience,
  ReferralAttributionCorrectionResponse,
  SupportManagerTicketResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type {
  ManagerRepository,
  SettledPatientActivityInput,
  SettledPatientActivityResult,
  StoredReferralLinkForClaim,
} from "../domain/manager-repository.types.js";

class ConcurrentAttributionCorrectionError extends Error {
  constructor() {
    super("Concurrent attribution correction detected");
    this.name = "ConcurrentAttributionCorrectionError";
  }
}

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findReferralLinkForClaim(id: string): Promise<StoredReferralLinkForClaim | null> {
    const record = await this.database.referralLink.findUnique({
      select: {
        audience: true,
        id: true,
        label: true,
        managerProfile: { select: { status: true } },
        managerProfileId: true,
        organizationType: true,
        signingKeyId: true,
        status: true,
        tokenVersion: true,
        validFrom: true,
        validUntil: true,
      },
      where: { id },
    });
    return record === null
      ? null
      : {
          audience: record.audience,
          id: record.id,
          label: record.label,
          managerProfileId: record.managerProfileId,
          managerStatus: record.managerProfile.status,
          organizationType: record.organizationType,
          signingKeyId: record.signingKeyId,
          status: record.status,
          tokenVersion: record.tokenVersion,
          validFrom: record.validFrom,
          validUntil: record.validUntil,
        };
  }

  async findManagerByPrincipal(principalId: string): Promise<ManagerProfileResponse | null> {
    return this.database.managerProfile.findUnique({
      select: { displayName: true, id: true, status: true },
      where: { principalId },
    });
  }

  async createManagerProfile(input: {
    displayName: string;
    grantedByPrincipalId: string;
    principalId: string;
  }): Promise<ManagerProfileResponse> {
    return this.database.$transaction(async (transaction) => {
      const existingRole = await transaction.roleAssignment.findFirst({
        select: { id: true },
        where: {
          effectiveUntil: null,
          principalId: input.principalId,
          role: "MANAGER",
          scope: "PLATFORM",
        },
      });
      if (existingRole === null) {
        await transaction.roleAssignment.create({
          data: {
            grantedByPrincipalId: input.grantedByPrincipalId,
            id: createOpaqueId(),
            principalId: input.principalId,
            role: "MANAGER",
            scope: "PLATFORM",
            updatedAt: new Date(),
          },
        });
      }
      return transaction.managerProfile.create({
        data: {
          displayName: input.displayName,
          id: createOpaqueId(),
          principalId: input.principalId,
          updatedAt: new Date(),
        },
        select: { displayName: true, id: true, status: true },
      });
    });
  }

  async createCommissionPolicy(input: {
    activityType: PatientActivityType;
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    managerProfileId: string;
    minimumGrossMinor?: bigint;
    rateBps: number;
  }): Promise<CommissionPolicyResponse> {
    const record = await this.database.commissionPolicy.create({
      data: {
        activityType: input.activityType,
        createdByPrincipalId: input.createdByPrincipalId,
        currency: input.currency,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        id: createOpaqueId(),
        managerProfileId: input.managerProfileId,
        minimumGrossMinor: input.minimumGrossMinor,
        rateBps: input.rateBps,
        updatedAt: new Date(),
      },
    });
    return mapCommissionPolicy(record);
  }

  async activateCommissionPolicy(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    policyId: string;
  }): Promise<CommissionPolicyResponse | null> {
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.commissionPolicy.updateMany({
        data: {
          approvedByPrincipalId: input.approvedByPrincipalId,
          status: "ACTIVE",
          updatedAt: new Date(),
          version: { increment: 1 },
        },
        where: { id: input.policyId, status: "DRAFT", version: input.expectedVersion },
      });
      if (result.count !== 1) return null;
      const record = await transaction.commissionPolicy.findUniqueOrThrow({
        where: { id: input.policyId },
      });
      return mapCommissionPolicy(record);
    });
  }

  async correctAttribution(input: {
    actorPrincipalId: string;
    applicationId: string;
    correlationId?: string;
    expectedVersion: number;
    managerProfileId?: string;
    reasonCategory: string;
    referralLinkId?: string;
    requestId: string;
  }): Promise<ReferralAttributionCorrectionResponse | null> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const current = await transaction.currentReferralAttribution.findUnique({
          select: { currentEventId: true },
          where: { applicationId: input.applicationId, version: input.expectedVersion },
        });
        if (current === null) return null;

        if (input.managerProfileId !== undefined && input.referralLinkId !== undefined) {
          const target = await transaction.referralLink.findFirst({
            select: { id: true },
            where: {
              id: input.referralLinkId,
              managerProfileId: input.managerProfileId,
              managerProfile: { status: "ACTIVE" },
              status: "ACTIVE",
            },
          });
          if (target === null) return null;
        }

        const eventId = createOpaqueId();
        const removing = input.managerProfileId === undefined;
        await transaction.referralAttributionEvent.create({
          data: {
            actorPrincipalId: input.actorPrincipalId,
            applicationId: input.applicationId,
            correlationId: input.correlationId,
            eventType: removing ? "REMOVED" : "CORRECTED",
            id: eventId,
            managerProfileId: input.managerProfileId,
            previousEventId: current.currentEventId,
            reasonCategory: input.reasonCategory,
            referralLinkId: input.referralLinkId,
            requestId: input.requestId,
          },
        });
        const updated = await transaction.currentReferralAttribution.updateMany({
          data: {
            currentEventId: eventId,
            managerProfileId: input.managerProfileId ?? null,
            referralLinkId: input.referralLinkId ?? null,
            updatedAt: new Date(),
            version: { increment: 1 },
          },
          where: { applicationId: input.applicationId, version: input.expectedVersion },
        });
        if (updated.count !== 1) throw new ConcurrentAttributionCorrectionError();
        return {
          applicationId: input.applicationId,
          eventId,
          eventType: removing ? "REMOVED" : "CORRECTED",
          managerProfileId: input.managerProfileId ?? null,
          referralLinkId: input.referralLinkId ?? null,
          version: input.expectedVersion + 1,
        };
      });
    } catch (error) {
      // Throwing inside the transaction rolls back the append-only event; the
      // application layer can then return the same safe 409 used for stale input.
      if (error instanceof ConcurrentAttributionCorrectionError) return null;
      throw error;
    }
  }

  async createReferralLink(input: {
    audience: ReferralAudience;
    createdByPrincipalId: string;
    label: string;
    managerProfileId: string;
    organizationType?: PublicOrganizationType;
    signingKeyId: string;
    validUntil?: Date;
  }): Promise<StoredReferralLinkForClaim> {
    const record = await this.database.referralLink.create({
      data: {
        audience: input.audience,
        createdByPrincipalId: input.createdByPrincipalId,
        id: createOpaqueId(),
        label: input.label,
        managerProfileId: input.managerProfileId,
        organizationType: input.organizationType,
        signingKeyId: input.signingKeyId,
        updatedAt: new Date(),
        validUntil: input.validUntil,
      },
      select: {
        audience: true,
        id: true,
        label: true,
        managerProfile: { select: { status: true } },
        managerProfileId: true,
        organizationType: true,
        signingKeyId: true,
        status: true,
        tokenVersion: true,
        validFrom: true,
        validUntil: true,
      },
    });
    return { ...record, managerStatus: record.managerProfile.status };
  }

  async listReferralLinks(managerProfileId: string): Promise<StoredReferralLinkForClaim[]> {
    const records = await this.database.referralLink.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        audience: true,
        id: true,
        label: true,
        managerProfile: { select: { status: true } },
        managerProfileId: true,
        organizationType: true,
        signingKeyId: true,
        status: true,
        tokenVersion: true,
        validFrom: true,
        validUntil: true,
      },
      take: 100,
      where: { managerProfileId },
    });
    return records.map((record) => ({ ...record, managerStatus: record.managerProfile.status }));
  }

  async listReferralStatuses(input: {
    cursor?: { applicationId: string; updatedAt: Date };
    limit: number;
    managerProfileId: string;
  }): Promise<{
    cursor: { applicationId: string; updatedAt: Date } | null;
    data: ManagerReferralStatusResponse[];
    hasNextPage: boolean;
  }> {
    const records = await this.database.currentReferralAttribution.findMany({
      orderBy: [{ updatedAt: "desc" }, { applicationId: "desc" }],
      select: {
        application: {
          select: { createdAt: true, decidedAt: true, kind: true, status: true, submittedAt: true },
        },
        applicationId: true,
        currentEventId: true,
        updatedAt: true,
      },
      take: input.limit + 1,
      where: {
        managerProfileId: input.managerProfileId,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { updatedAt: { lt: input.cursor.updatedAt } },
                {
                  applicationId: { lt: input.cursor.applicationId },
                  updatedAt: input.cursor.updatedAt,
                },
              ],
            }),
      },
    });
    const hasNextPage = records.length > input.limit;
    const page = records.slice(0, input.limit);
    const last = page.at(-1);
    return {
      cursor:
        hasNextPage && last !== undefined
          ? { applicationId: last.applicationId, updatedAt: last.updatedAt }
          : null,
      data: page.map((record) => ({
        applicationKind: record.application.kind,
        applicationStatus: record.application.status,
        attributionId: record.currentEventId,
        createdAt: record.application.createdAt.toISOString(),
        decidedAt: record.application.decidedAt?.toISOString() ?? null,
        submittedAt: record.application.submittedAt?.toISOString() ?? null,
      })),
      hasNextPage,
    };
  }

  async listEarnings(input: {
    cursor?: { id: string; occurredAt: Date };
    from: Date;
    granularity: "DAY" | "MONTH";
    limit: number;
    managerProfileId: string;
    timeZone: string;
    to: Date;
  }): Promise<ManagerEarningsReportResponse> {
    const where = {
      managerProfileId: input.managerProfileId,
      occurredAt: { gte: input.from, lt: input.to },
    } as const;
    const [entries, totals, buckets] = await Promise.all([
      this.database.managerEarning.findMany({
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: {
          activityType: true,
          amountMinor: true,
          currency: true,
          id: true,
          occurredAt: true,
          status: true,
        },
        take: input.limit + 1,
        where: {
          ...where,
          ...(input.cursor === undefined
            ? {}
            : {
                OR: [
                  { occurredAt: { lt: input.cursor.occurredAt } },
                  { id: { lt: input.cursor.id }, occurredAt: input.cursor.occurredAt },
                ],
              }),
        },
      }),
      this.database.managerEarning.groupBy({
        _sum: { amountMinor: true },
        by: ["currency"],
        where,
      }),
      this.earningBuckets(input),
    ]);
    const hasNextPage = entries.length > input.limit;
    const page = entries.slice(0, input.limit);
    const last = page.at(-1);
    return {
      buckets: buckets.map((bucket) => ({
        amountMinor: bucket.amount_minor.toString(),
        currency: bucket.currency,
        periodStart: bucket.period_start,
      })),
      entries: page.map((entry) => ({
        activityType: entry.activityType,
        amountMinor: entry.amountMinor.toString(),
        currency: entry.currency,
        id: entry.id,
        occurredAt: entry.occurredAt.toISOString(),
        status: entry.status,
      })),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? Buffer.from(`${last.occurredAt.toISOString()}|${last.id}`, "utf8").toString(
                "base64url",
              )
            : null,
        hasNextPage,
      },
      range: {
        from: input.from.toISOString(),
        timeZone: input.timeZone,
        to: input.to.toISOString(),
      },
      totals: totals.map((total) => ({
        amountMinor: (total._sum.amountMinor ?? 0n).toString(),
        currency: total.currency,
      })),
    };
  }

  async recordSettledPatientActivity(
    input: SettledPatientActivityInput,
  ): Promise<SettledPatientActivityResult> {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.patientActivitySettlement.findUnique({
        select: { earnings: { select: { id: true }, take: 1 }, id: true },
        where: { sourceEventKey: input.sourceEventKey },
      });
      if (existing !== null) {
        return {
          earningCreated: existing.earnings.length > 0,
          earningId: existing.earnings[0]?.id ?? null,
          settlementId: existing.id,
        };
      }

      const proposedSettlementId = createOpaqueId();
      const settlement = await transaction.patientActivitySettlement.upsert({
        create: {
          activityType: input.activityType,
          currency: input.currency,
          grossAmountMinor: input.grossAmountMinor,
          id: proposedSettlementId,
          patientId: input.patientId,
          recordedByPrincipalId: input.recordedByPrincipalId,
          settledAt: input.settledAt,
          sourceEventKey: input.sourceEventKey,
          sourceType: input.sourceType,
        },
        select: { earnings: { select: { id: true }, take: 1 }, id: true },
        update: {},
        where: { sourceEventKey: input.sourceEventKey },
      });
      if (settlement.id !== proposedSettlementId) {
        return {
          earningCreated: settlement.earnings.length > 0,
          earningId: settlement.earnings[0]?.id ?? null,
          settlementId: settlement.id,
        };
      }
      const settlementId = settlement.id;

      const patient = await transaction.patient.findUnique({
        select: {
          approvedApplication: {
            select: {
              referralAttribution: { select: { managerProfileId: true } },
            },
          },
        },
        where: { id: input.patientId },
      });
      const managerProfileId =
        patient?.approvedApplication?.referralAttribution?.managerProfileId ?? null;
      if (managerProfileId === null) {
        return { earningCreated: false, earningId: null, settlementId };
      }

      const policy = await transaction.commissionPolicy.findFirst({
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        select: { id: true, rateBps: true },
        where: {
          activityType: input.activityType,
          currency: input.currency,
          effectiveFrom: { lte: input.settledAt },
          managerProfileId,
          AND: [
            {
              OR: [
                { minimumGrossMinor: null },
                { minimumGrossMinor: { lte: input.grossAmountMinor } },
              ],
            },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: input.settledAt } }] },
          ],
          status: "ACTIVE",
        },
      });
      if (policy === null) {
        return { earningCreated: false, earningId: null, settlementId };
      }

      // Commission is deliberately rounded down in minor units; no floating-point money.
      const amountMinor = (input.grossAmountMinor * BigInt(policy.rateBps)) / 10_000n;
      if (amountMinor <= 0n) {
        return { earningCreated: false, earningId: null, settlementId };
      }
      const earningId = createOpaqueId();
      await transaction.managerEarning.create({
        data: {
          activityType: input.activityType,
          amountMinor,
          currency: input.currency,
          entryType: "EARNING",
          eventKey: `settlement:${settlementId}:earning`,
          id: earningId,
          managerProfileId,
          occurredAt: input.settledAt,
          policyId: policy.id,
          settlementId,
        },
      });
      return { earningCreated: true, earningId, settlementId };
    });
  }

  async createManagerTicket(input: {
    category: ManagerTicketCategory;
    managerProfileId: string;
    principalId: string;
    subjectDisplayName: string;
    subjectReference?: string;
  }): Promise<ManagerTicketResponse> {
    const id = createOpaqueId();
    const record = await this.database.managerSupportTicket.create({
      data: {
        category: input.category,
        createdByPrincipalId: input.principalId,
        id,
        managerProfileId: input.managerProfileId,
        subjectDisplayName: input.subjectDisplayName,
        subjectReference: input.subjectReference,
        // UUIDv7 prefixes are time-ordered and can collide when truncated. Keep
        // the random trailing 80 bits for a compact, non-sequential public ID.
        ticketNumber: `RPT-${id.replaceAll("-", "").slice(-20).toUpperCase()}`,
        updatedAt: new Date(),
      },
      select: ticketSelect,
    });
    return mapTicket(record);
  }

  async listManagerTickets(input: {
    cursor?: { id: string; updatedAt: Date };
    limit: number;
    managerProfileId: string;
  }): Promise<{ data: ManagerTicketResponse[]; hasNextPage: boolean }> {
    const records = await this.database.managerSupportTicket.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: ticketSelect,
      take: input.limit + 1,
      where: {
        managerProfileId: input.managerProfileId,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { updatedAt: { lt: input.cursor.updatedAt } },
                { id: { lt: input.cursor.id }, updatedAt: input.cursor.updatedAt },
              ],
            }),
      },
    });
    return {
      data: records.slice(0, input.limit).map(mapTicket),
      hasNextPage: records.length > input.limit,
    };
  }

  async getManagerTicket(input: {
    managerProfileId: string;
    ticketId: string;
  }): Promise<ManagerTicketResponse | null> {
    const record = await this.database.managerSupportTicket.findFirst({
      select: ticketSelect,
      where: { id: input.ticketId, managerProfileId: input.managerProfileId },
    });
    return record === null ? null : mapTicket(record);
  }

  async addManagerTicketFollowUp(input: {
    authorPrincipalId: string;
    body: string;
    managerProfileId: string;
    ticketId: string;
  }): Promise<ManagerTicketResponse | null> {
    return this.database.$transaction(async (transaction) => {
      const ticket = await transaction.managerSupportTicket.findFirst({
        select: { id: true },
        where: {
          id: input.ticketId,
          managerProfileId: input.managerProfileId,
          status: { not: "CLOSED" },
        },
      });
      if (ticket === null) return null;
      await transaction.managerTicketFollowUp.create({
        data: {
          authorPrincipalId: input.authorPrincipalId,
          body: input.body,
          id: createOpaqueId(),
          ticketId: input.ticketId,
          visibility: "MANAGER",
        },
      });
      const updated = await transaction.managerSupportTicket.update({
        data: { updatedAt: new Date(), version: { increment: 1 } },
        select: ticketSelect,
        where: { id: input.ticketId },
      });
      return mapTicket(updated);
    });
  }

  async listSupportTickets(input: {
    cursor?: { id: string; updatedAt: Date };
    limit: number;
    status?: ManagerTicketResponse["status"];
  }): Promise<{ data: SupportManagerTicketResponse[]; hasNextPage: boolean }> {
    const records = await this.database.managerSupportTicket.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: supportTicketSelect,
      take: input.limit + 1,
      where: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { updatedAt: { lt: input.cursor.updatedAt } },
                { id: { lt: input.cursor.id }, updatedAt: input.cursor.updatedAt },
              ],
            }),
      },
    });
    return {
      data: records.slice(0, input.limit).map(mapSupportTicket),
      hasNextPage: records.length > input.limit,
    };
  }

  async reviewManagerTicket(input: {
    authorPrincipalId: string;
    body?: string;
    expectedVersion: number;
    status: ManagerTicketResponse["status"];
    ticketId: string;
  }): Promise<SupportManagerTicketResponse | null> {
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.managerSupportTicket.updateMany({
        data: { status: input.status, updatedAt: new Date(), version: { increment: 1 } },
        where: {
          id: input.ticketId,
          status: { in: allowedTicketSources(input.status) },
          version: input.expectedVersion,
        },
      });
      if (result.count !== 1) return null;
      if (input.body !== undefined) {
        await transaction.managerTicketFollowUp.create({
          data: {
            authorPrincipalId: input.authorPrincipalId,
            body: input.body,
            id: createOpaqueId(),
            ticketId: input.ticketId,
            visibility: "INTERNAL",
          },
        });
      }
      const ticket = await transaction.managerSupportTicket.findUniqueOrThrow({
        select: supportTicketSelect,
        where: { id: input.ticketId },
      });
      return mapSupportTicket(ticket);
    });
  }

  private earningBuckets(input: {
    from: Date;
    granularity: "DAY" | "MONTH";
    managerProfileId: string;
    timeZone: string;
    to: Date;
  }) {
    const periodFormat = input.granularity === "DAY" ? "YYYY-MM-DD" : "YYYY-MM-01";
    return this.database.$queryRaw<
      Array<{ amount_minor: bigint; currency: string; period_start: string }>
    >(Prisma.sql`
      SELECT
        to_char("occurred_at" AT TIME ZONE ${input.timeZone}, ${periodFormat}) AS "period_start",
        "currency",
        sum("amount_minor")::bigint AS "amount_minor"
      FROM "manager_earnings"
      WHERE "manager_profile_id" = ${input.managerProfileId}::uuid
        AND "occurred_at" >= ${input.from}
        AND "occurred_at" < ${input.to}
      GROUP BY 1, "currency"
      ORDER BY 1 ASC, "currency" ASC
    `);
  }
}

const ticketSelect = {
  category: true,
  createdAt: true,
  followUps: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { body: true, createdAt: true, id: true },
    where: { visibility: "MANAGER" },
  },
  id: true,
  status: true,
  subjectDisplayName: true,
  subjectReference: true,
  ticketNumber: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.ManagerSupportTicketSelect;

const supportTicketSelect = {
  category: true,
  createdAt: true,
  followUps: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { body: true, createdAt: true, id: true, visibility: true },
  },
  id: true,
  managerProfileId: true,
  status: true,
  subjectDisplayName: true,
  subjectReference: true,
  ticketNumber: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.ManagerSupportTicketSelect;

function mapTicket(record: {
  category: ManagerTicketResponse["category"];
  createdAt: Date;
  followUps: Array<{ body: string; createdAt: Date; id: string }>;
  id: string;
  status: ManagerTicketResponse["status"];
  subjectDisplayName: string;
  subjectReference: string | null;
  ticketNumber: string;
  updatedAt: Date;
  version: number;
}): ManagerTicketResponse {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    followUps: record.followUps.map((followUp) => ({
      ...followUp,
      createdAt: followUp.createdAt.toISOString(),
    })),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapSupportTicket(record: {
  category: SupportManagerTicketResponse["category"];
  createdAt: Date;
  followUps: Array<{
    body: string;
    createdAt: Date;
    id: string;
    visibility: "MANAGER" | "INTERNAL";
  }>;
  id: string;
  managerProfileId: string;
  status: SupportManagerTicketResponse["status"];
  subjectDisplayName: string;
  subjectReference: string | null;
  ticketNumber: string;
  updatedAt: Date;
  version: number;
}): SupportManagerTicketResponse {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    followUps: record.followUps.map((followUp) => ({
      ...followUp,
      createdAt: followUp.createdAt.toISOString(),
    })),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapCommissionPolicy(record: {
  activityType: CommissionPolicyResponse["activityType"];
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  id: string;
  managerProfileId: string;
  minimumGrossMinor: bigint | null;
  rateBps: number;
  status: CommissionPolicyResponse["status"];
  version: number;
}): CommissionPolicyResponse {
  return {
    ...record,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveUntil: record.effectiveUntil?.toISOString() ?? null,
    minimumGrossMinor: record.minimumGrossMinor?.toString() ?? null,
  };
}

function allowedTicketSources(
  target: ManagerTicketResponse["status"],
): ManagerTicketResponse["status"][] {
  switch (target) {
    case "IN_REVIEW":
      return ["ESCALATED", "WAITING_MANAGER"];
    case "WAITING_MANAGER":
      return ["IN_REVIEW"];
    case "RESOLVED":
      return ["IN_REVIEW", "WAITING_MANAGER"];
    case "CLOSED":
      return ["RESOLVED"];
    case "ESCALATED":
      return [];
  }
}
