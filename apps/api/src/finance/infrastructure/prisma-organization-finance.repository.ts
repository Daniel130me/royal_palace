import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type {
  OrganizationFinanceRepository,
  ReportGranularity,
} from "../domain/organization-finance.types.js";

const ACTIVE_RESERVATION_STATUSES = [
  "REQUESTED",
  "REVIEW_REQUIRED",
  "APPROVED",
  "PROCESSING",
] as const;
const PAYOUT_REQUEST_OPERATION = "organization.payout.request";
const SETTLEMENT_FINALIZE_OPERATION = "organization.settlement.finalize";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PrismaOrganizationFinanceRepository implements OrganizationFinanceRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async listStatements(input: { organizationId?: string; limit: number }) {
    const rows = await this.database.organizationSettlement.findMany({
      orderBy: [{ finalizedAt: "desc" }, { id: "desc" }],
      select: {
        currency: true,
        earningCount: true,
        finalizedAt: true,
        grossAmountMinor: true,
        heldAmountMinor: true,
        id: true,
        organization: { select: { displayName: true, id: true, type: true } },
        payableAmountMinor: true,
        periodEnd: true,
        periodStart: true,
        settlementNumber: true,
        status: true,
      },
      take: input.limit,
      where: input.organizationId === undefined ? {} : { organizationId: input.organizationId },
    });
    return { data: rows.map(mapStatement) };
  }

  async finalizeStatement(input: {
    currency: string;
    finalizedByPrincipalId: string;
    from: Date;
    idempotencyKey: string;
    organizationId: string;
    to: Date;
    traceRequestId: string;
  }) {
    return this.database.$transaction(
      async (transaction) => {
        const requestHash = createHash("sha256")
          .update(
            `${input.organizationId}:${input.currency}:${input.from.toISOString()}:${input.to.toISOString()}`,
          )
          .digest("hex");
        const idempotency = await transaction.idempotencyKey.findUnique({
          where: {
            principalId_operation_key: {
              key: input.idempotencyKey,
              operation: SETTLEMENT_FINALIZE_OPERATION,
              principalId: input.finalizedByPrincipalId,
            },
          },
        });
        if (idempotency !== null) {
          if (idempotency.requestHash !== requestHash || idempotency.resourceId === null)
            return null;
          const existing = await transaction.organizationSettlement.findUnique({
            include: { organization: { select: { displayName: true, id: true, type: true } } },
            where: { id: idempotency.resourceId },
          });
          return existing === null ? null : mapStatement(existing);
        }

        const earnings = await transaction.organizationEarning.findMany({
          orderBy: [{ earnedAt: "asc" }, { id: "asc" }],
          select: {
            grossAmountMinor: true,
            id: true,
            payableAmountMinor: true,
            status: true,
          },
          where: {
            currency: input.currency,
            earnedAt: { gte: input.from, lt: input.to },
            organizationId: input.organizationId,
            settlementAllocation: null,
          },
        });
        if (earnings.length === 0) return null;
        const grossAmountMinor = earnings.reduce((sum, item) => sum + item.grossAmountMinor, 0n);
        const payableAmountMinor = earnings.reduce(
          (sum, item) => sum + item.payableAmountMinor,
          0n,
        );
        const heldAmountMinor = earnings.reduce(
          (sum, item) => sum + (item.status === "AVAILABLE" ? 0n : item.payableAmountMinor),
          0n,
        );
        const settlementId = createOpaqueId();
        const now = new Date();
        const statement = await transaction.organizationSettlement.create({
          data: {
            allocations: {
              create: earnings.map((earning) => ({
                earningId: earning.id,
                earningStatusSnapshot: earning.status,
                grossAmountMinorSnapshot: earning.grossAmountMinor,
                id: createOpaqueId(),
                payableAmountMinorSnapshot: earning.payableAmountMinor,
              })),
            },
            currency: input.currency,
            earningCount: earnings.length,
            finalizedAt: now,
            finalizedByPrincipalId: input.finalizedByPrincipalId,
            grossAmountMinor,
            heldAmountMinor,
            id: settlementId,
            organizationId: input.organizationId,
            payableAmountMinor,
            periodEnd: input.to,
            periodStart: input.from,
            settlementNumber: `SETTLEMENT-${settlementId}`,
          },
          include: { organization: { select: { displayName: true, id: true, type: true } } },
        });
        await transaction.idempotencyKey.create({
          data: {
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            id: createOpaqueId(),
            key: input.idempotencyKey,
            operation: SETTLEMENT_FINALIZE_OPERATION,
            principalId: input.finalizedByPrincipalId,
            requestHash,
            resourceId: settlementId,
            resourceType: "organization_settlement",
            responseStatusCode: 201,
            status: "COMPLETED",
            updatedAt: now,
          },
        });
        await transaction.auditEvent.create({
          data: {
            action: "organization.settlement.finalized",
            actorPrincipalId: input.finalizedByPrincipalId,
            id: createOpaqueId(),
            organizationId: input.organizationId,
            requestId: input.traceRequestId,
            resourceId: settlementId,
            resourceType: "organization_settlement",
            result: "SUCCEEDED",
          },
        });
        return mapStatement(statement);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async listAdvancedReport(input: { from: Date; granularity: ReportGranularity; to: Date }) {
    const earningPeriod = financePeriodStart(input.granularity, "e", input.from);
    const payoutPeriod = financePeriodStart(input.granularity, "p", input.from);
    const rows = await this.database.$queryRaw<AdvancedFinanceRow[]>(Prisma.sql`
      WITH earning_totals AS (
        SELECT ${earningPeriod} AS "periodStart", e."currency",
          COUNT(*)::bigint AS "earningCount",
          COALESCE(SUM(e."gross_amount_minor"), 0)::bigint AS "grossAmountMinor",
          COALESCE(SUM(e."payable_amount_minor"), 0)::bigint AS "payableAmountMinor",
          COALESCE(SUM(e."payable_amount_minor") FILTER (WHERE e."status" <> 'AVAILABLE'), 0)::bigint AS "heldAmountMinor",
          COUNT(*) FILTER (WHERE e."status" = 'RECONCILIATION_REQUIRED')::bigint AS "reconciliationCount"
        FROM "organization_earnings" e
        WHERE e."earned_at" >= ${input.from} AND e."earned_at" < ${input.to}
        GROUP BY "periodStart", e."currency"
      ), payout_totals AS (
        SELECT ${payoutPeriod} AS "periodStart", p."currency",
          COUNT(*)::bigint AS "payoutCount",
          COALESCE(SUM(p."requested_amount_minor") FILTER (WHERE p."status" = 'PAID'), 0)::bigint AS "paidAmountMinor",
          COUNT(*) FILTER (WHERE p."status" = 'FAILED')::bigint AS "failedPayoutCount",
          COUNT(*) FILTER (WHERE p."status" = 'REVIEW_REQUIRED')::bigint AS "payoutReconciliationCount"
        FROM "organization_payout_requests" p
        WHERE p."requested_at" >= ${input.from} AND p."requested_at" < ${input.to}
        GROUP BY "periodStart", p."currency"
      ), keys AS (
        SELECT "periodStart", "currency" FROM earning_totals
        UNION SELECT "periodStart", "currency" FROM payout_totals
      )
      SELECT k."periodStart", k."currency",
        COALESCE(e."earningCount", 0)::bigint AS "earningCount",
        COALESCE(e."grossAmountMinor", 0)::bigint AS "grossAmountMinor",
        COALESCE(e."payableAmountMinor", 0)::bigint AS "payableAmountMinor",
        COALESCE(e."heldAmountMinor", 0)::bigint AS "heldAmountMinor",
        (COALESCE(e."reconciliationCount", 0) + COALESCE(p."payoutReconciliationCount", 0))::bigint AS "reconciliationCount",
        COALESCE(p."payoutCount", 0)::bigint AS "payoutCount",
        COALESCE(p."paidAmountMinor", 0)::bigint AS "paidAmountMinor",
        COALESCE(p."failedPayoutCount", 0)::bigint AS "failedPayoutCount"
      FROM keys k
      LEFT JOIN earning_totals e USING ("periodStart", "currency")
      LEFT JOIN payout_totals p USING ("periodStart", "currency")
      ORDER BY k."periodStart" ASC, k."currency" ASC
    `);
    return {
      data: rows.map(mapAdvancedFinance),
      from: input.from.toISOString(),
      granularity: input.granularity,
      to: input.to.toISOString(),
    };
  }

  async listSettlementReport(input: {
    from: Date;
    granularity: ReportGranularity;
    organizationId?: string;
    to: Date;
  }) {
    const periodStart = reportPeriodStart(input.granularity, input.from);
    const periodEnd = reportPeriodEnd(input.granularity, input.to);
    const organizationFilter =
      input.organizationId === undefined
        ? Prisma.empty
        : Prisma.sql`AND e."organization_id" = ${input.organizationId}::uuid`;
    const rows = await this.database.$queryRaw<SettlementAggregateRow[]>(Prisma.sql`
      WITH allocation_totals AS (
        SELECT
          a."earning_id",
          COALESCE(SUM(a."amount_minor") FILTER (WHERE p."status" = 'PAID'), 0)::bigint AS "paidAmountMinor",
          COALESCE(SUM(a."amount_minor") FILTER (
            WHERE p."status" IN ('REQUESTED', 'REVIEW_REQUIRED', 'APPROVED', 'PROCESSING')
          ), 0)::bigint AS "reservedAmountMinor"
        FROM "organization_payout_allocations" a
        JOIN "organization_payout_requests" p ON p."id" = a."payout_request_id"
        GROUP BY a."earning_id"
      ),
      earning_projection AS (
        SELECT
          o."id" AS "organizationId",
          o."display_name" AS "organizationDisplayName",
          o."type"::text AS "organizationType",
          e."currency",
          ${periodStart} AS "periodStart",
          ${periodEnd} AS "periodEnd",
          e."gross_amount_minor" AS "grossAmountMinor",
          e."payable_amount_minor" AS "payableAmountMinor",
          e."status",
          COALESCE(a."paidAmountMinor", 0)::bigint AS "paidAmountMinor",
          COALESCE(a."reservedAmountMinor", 0)::bigint AS "reservedAmountMinor"
        FROM "organization_earnings" e
        JOIN "organizations" o ON o."id" = e."organization_id"
        LEFT JOIN allocation_totals a ON a."earning_id" = e."id"
        WHERE e."earned_at" >= ${input.from}
          AND e."earned_at" < ${input.to}
          ${organizationFilter}
      )
      SELECT
        "organizationId",
        "organizationDisplayName",
        "organizationType",
        "currency",
        "periodStart",
        "periodEnd",
        COUNT(*)::bigint AS "earningCount",
        SUM("grossAmountMinor")::bigint AS "grossAmountMinor",
        SUM("payableAmountMinor")::bigint AS "payableAmountMinor",
        SUM("paidAmountMinor")::bigint AS "paidAmountMinor",
        SUM("reservedAmountMinor")::bigint AS "reservedAmountMinor",
        SUM(
          CASE WHEN "status" = 'AVAILABLE' THEN 0
          ELSE GREATEST(
            "payableAmountMinor" - "paidAmountMinor" - "reservedAmountMinor",
            0
          ) END
        )::bigint AS "heldAmountMinor",
        SUM(
          CASE WHEN "status" = 'AVAILABLE' THEN GREATEST(
            "payableAmountMinor" - "paidAmountMinor" - "reservedAmountMinor",
            0
          ) ELSE 0 END
        )::bigint AS "availableAmountMinor"
      FROM earning_projection
      GROUP BY
        "organizationId",
        "organizationDisplayName",
        "organizationType",
        "currency",
        "periodStart",
        "periodEnd"
      ORDER BY
        "periodStart" DESC,
        "organizationDisplayName" ASC,
        "organizationId" ASC,
        "currency" ASC
    `);
    return {
      data: rows.map(mapSettlementAggregate),
      from: input.from.toISOString(),
      granularity: input.granularity,
      to: input.to.toISOString(),
    };
  }

  async listPayouts(input: { organizationId?: string; limit: number }) {
    const rows = await this.database.organizationPayoutRequest.findMany({
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: {
        currency: true,
        executedByPrincipalId: true,
        executionStartedAt: true,
        id: true,
        organization: { select: { displayName: true, id: true, type: true } },
        paidAt: true,
        payoutNumber: true,
        providerCode: true,
        providerReference: true,
        requestedAmountMinor: true,
        requestedAt: true,
        reviewReasonCode: true,
        reviewedAt: true,
        status: true,
        version: true,
      },
      take: input.limit,
      where: input.organizationId === undefined ? {} : { organizationId: input.organizationId },
    });
    return { data: rows.map(mapPayout) };
  }

  async requestPayout(input: {
    currency: string;
    idempotencyKey: string;
    organizationId: string;
    requestedAmountMinor: bigint;
    requestedByPrincipalId: string;
    traceRequestId: string;
  }) {
    return this.database.$transaction(
      async (transaction) => {
        const idempotency = await transaction.idempotencyKey.findUnique({
          where: {
            principalId_operation_key: {
              key: input.idempotencyKey,
              operation: PAYOUT_REQUEST_OPERATION,
              principalId: input.requestedByPrincipalId,
            },
          },
        });
        const requestHash = createHash("sha256")
          .update(`${input.organizationId}:${input.currency}:${input.requestedAmountMinor}`)
          .digest("hex");
        if (idempotency !== null) {
          if (idempotency.requestHash !== requestHash || idempotency.resourceId === null)
            return null;
          const existing = await transaction.organizationPayoutRequest.findUnique({
            include: { organization: { select: { displayName: true, id: true, type: true } } },
            where: { id: idempotency.resourceId },
          });
          return existing === null ? null : mapPayout(existing);
        }

        const earnings = await transaction.organizationEarning.findMany({
          orderBy: [{ earnedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            payableAmountMinor: true,
            payoutAllocations: {
              select: { amountMinor: true },
              where: {
                payoutRequest: { status: { in: [...ACTIVE_RESERVATION_STATUSES, "PAID"] } },
              },
            },
          },
          where: {
            currency: input.currency,
            organizationId: input.organizationId,
            status: "AVAILABLE",
          },
        });
        let remaining = input.requestedAmountMinor;
        const allocations: { amountMinor: bigint; earningId: string; id: string }[] = [];
        for (const earning of earnings) {
          const committed = earning.payoutAllocations.reduce(
            (sum, item) => sum + item.amountMinor,
            0n,
          );
          const available = earning.payableAmountMinor - committed;
          if (available <= 0n) continue;
          const amountMinor = available < remaining ? available : remaining;
          allocations.push({ amountMinor, earningId: earning.id, id: createOpaqueId() });
          remaining -= amountMinor;
          if (remaining === 0n) break;
        }
        if (remaining !== 0n) return null;

        const payoutId = createOpaqueId();
        const now = new Date();
        const payout = await transaction.organizationPayoutRequest.create({
          data: {
            allocations: { create: allocations },
            currency: input.currency,
            id: payoutId,
            organizationId: input.organizationId,
            payoutNumber: `PAYOUT-${payoutId}`,
            requestedAmountMinor: input.requestedAmountMinor,
            requestedAt: now,
            requestedByPrincipalId: input.requestedByPrincipalId,
            updatedAt: now,
          },
          include: { organization: { select: { displayName: true, id: true, type: true } } },
        });
        await transaction.idempotencyKey.create({
          data: {
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            id: createOpaqueId(),
            key: input.idempotencyKey,
            operation: PAYOUT_REQUEST_OPERATION,
            principalId: input.requestedByPrincipalId,
            requestHash,
            resourceId: payoutId,
            resourceType: "organization_payout",
            responseStatusCode: 201,
            status: "COMPLETED",
            updatedAt: now,
          },
        });
        await transaction.auditEvent.create({
          data: {
            action: "organization.payout.requested",
            actorPrincipalId: input.requestedByPrincipalId,
            id: createOpaqueId(),
            organizationId: input.organizationId,
            requestId: input.traceRequestId,
            resourceId: payoutId,
            resourceType: "organization_payout",
            result: "SUCCEEDED",
          },
        });
        return mapPayout(payout);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async reviewPayout(input: {
    decision: "APPROVE" | "REJECT";
    expectedVersion: number;
    payoutId: string;
    reasonCode: string;
    reviewedByPrincipalId: string;
    traceRequestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.organizationPayoutRequest.updateMany({
        data: {
          reviewReasonCode: input.reasonCode,
          reviewedAt: now,
          reviewedByPrincipalId: input.reviewedByPrincipalId,
          status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: {
          id: input.payoutId,
          OR: [
            { executedByPrincipalId: null },
            { executedByPrincipalId: { not: input.reviewedByPrincipalId } },
          ],
          requestedByPrincipalId: { not: input.reviewedByPrincipalId },
          status: { in: ["REQUESTED", "REVIEW_REQUIRED"] },
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) return null;
      const row = await transaction.organizationPayoutRequest.findUniqueOrThrow({
        include: { organization: { select: { displayName: true, id: true, type: true } } },
        where: { id: input.payoutId },
      });
      await transaction.auditEvent.create({
        data: {
          action:
            input.decision === "APPROVE"
              ? "organization.payout.approved"
              : "organization.payout.rejected",
          actorPrincipalId: input.reviewedByPrincipalId,
          id: createOpaqueId(),
          organizationId: row.organization.id,
          requestId: input.traceRequestId,
          resourceId: row.id,
          resourceType: "organization_payout",
          result: "SUCCEEDED",
        },
      });
      return mapPayout(row);
    });
  }

  async claimPayoutExecution(input: {
    executedByPrincipalId: string;
    expectedVersion: number;
    payoutId: string;
    traceRequestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.organizationPayoutRequest.updateMany({
        data: {
          executedByPrincipalId: input.executedByPrincipalId,
          executionStartedAt: now,
          status: "PROCESSING",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: {
          id: input.payoutId,
          requestedByPrincipalId: { not: input.executedByPrincipalId },
          reviewedByPrincipalId: { not: input.executedByPrincipalId },
          status: "APPROVED",
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) return null;
      const payout = await transaction.organizationPayoutRequest.findUniqueOrThrow({
        select: {
          currency: true,
          id: true,
          organizationId: true,
          payoutNumber: true,
          requestedAmountMinor: true,
        },
        where: { id: input.payoutId },
      });
      await transaction.auditEvent.create({
        data: {
          action: "organization.payout.execution_started",
          actorPrincipalId: input.executedByPrincipalId,
          id: createOpaqueId(),
          organizationId: payout.organizationId,
          requestId: input.traceRequestId,
          resourceId: payout.id,
          resourceType: "organization_payout",
          result: "SUCCEEDED",
        },
      });
      return {
        amountMinor: payout.requestedAmountMinor.toString(),
        currency: payout.currency,
        organizationId: payout.organizationId,
        payoutId: payout.id,
        payoutNumber: payout.payoutNumber,
      };
    });
  }

  async completePayoutExecution(input: {
    failureCode?: string;
    outcome: "SUCCEEDED" | "FAILED" | "UNKNOWN";
    payoutId: string;
    providerCode: string;
    providerReference: string;
    traceRequestId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.organizationPayoutRequest.updateMany({
        data: {
          paidAt: input.outcome === "SUCCEEDED" ? now : null,
          providerCode: input.providerCode,
          providerReference: input.providerReference,
          reviewReasonCode: input.outcome === "SUCCEEDED" ? undefined : input.failureCode,
          status:
            input.outcome === "SUCCEEDED"
              ? "PAID"
              : input.outcome === "FAILED"
                ? "FAILED"
                : "REVIEW_REQUIRED",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: input.payoutId, status: "PROCESSING" },
      });
      if (updated.count !== 1) return null;
      const row = await transaction.organizationPayoutRequest.findUniqueOrThrow({
        include: { organization: { select: { displayName: true, id: true, type: true } } },
        where: { id: input.payoutId },
      });
      await transaction.auditEvent.create({
        data: {
          action: `organization.payout.execution_${input.outcome.toLowerCase()}`,
          actorPrincipalId: row.executedByPrincipalId,
          id: createOpaqueId(),
          organizationId: row.organization.id,
          requestId: input.traceRequestId,
          resourceId: row.id,
          resourceType: "organization_payout",
          result: input.outcome === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
        },
      });
      return mapPayout(row);
    });
  }
}

export async function projectOrganizationEarning(
  transaction: Prisma.TransactionClient,
  payment: {
    amountMinor: bigint;
    currency: string;
    id: string;
    laboratoryBooking: {
      laboratoryOrganizationId: string;
      laboratoryPayoutMinor: bigint | null;
    } | null;
    purpose: string;
  },
  event: { eventType: string; occurredAt: Date },
) {
  if (payment.purpose !== "LABORATORY_BOOKING" || payment.laboratoryBooking === null) return;
  if (event.eventType === "SUCCEEDED") {
    if (payment.laboratoryBooking.laboratoryPayoutMinor === null) {
      throw new Error("Laboratory payout snapshot is required before settlement");
    }
    await transaction.organizationEarning.upsert({
      create: {
        category: "LABORATORY_SERVICE",
        currency: payment.currency,
        earnedAt: event.occurredAt,
        grossAmountMinor: payment.amountMinor,
        id: createOpaqueId(),
        organizationId: payment.laboratoryBooking.laboratoryOrganizationId,
        payableAmountMinor: payment.laboratoryBooking.laboratoryPayoutMinor,
        paymentId: payment.id,
        updatedAt: new Date(),
      },
      update: {},
      where: { paymentId: payment.id },
    });
    return;
  }
  if (!["PARTIALLY_REFUNDED", "REFUNDED", "REVERSED", "DISPUTED"].includes(event.eventType)) return;
  const earning = await transaction.organizationEarning.findUnique({
    select: {
      id: true,
      payoutAllocations: {
        select: { payoutRequestId: true, payoutRequest: { select: { status: true } } },
      },
      settlementAllocation: { select: { settlementId: true } },
    },
    where: { paymentId: payment.id },
  });
  if (earning === null) return;
  const paid = earning.payoutAllocations.some((item) => item.payoutRequest.status === "PAID");
  await transaction.organizationEarning.update({
    data: {
      holdReasonCode: `PAYMENT_${event.eventType}`,
      status: paid ? "RECONCILIATION_REQUIRED" : "ON_HOLD",
      updatedAt: new Date(),
      version: { increment: 1 },
    },
    where: { id: earning.id },
  });
  if (earning.settlementAllocation !== null) {
    await transaction.organizationSettlement.update({
      data: { status: "RECONCILIATION_REQUIRED" },
      where: { id: earning.settlementAllocation.settlementId },
    });
  }
  const affectedRequests = earning.payoutAllocations
    .filter((item) => ACTIVE_RESERVATION_STATUSES.includes(item.payoutRequest.status as never))
    .map((item) => item.payoutRequestId);
  if (affectedRequests.length > 0) {
    await transaction.organizationPayoutRequest.updateMany({
      data: { status: "REVIEW_REQUIRED", updatedAt: new Date(), version: { increment: 1 } },
      where: { id: { in: affectedRequests }, status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
    });
  }
}

function reportPeriodStart(granularity: ReportGranularity, from: Date) {
  if (granularity === "DAY") return Prisma.sql`date_trunc('day', e."earned_at")`;
  if (granularity === "MONTH") return Prisma.sql`date_trunc('month', e."earned_at")`;
  return Prisma.sql`${from}::timestamptz`;
}

function reportPeriodEnd(granularity: ReportGranularity, to: Date) {
  if (granularity === "DAY") return Prisma.sql`date_trunc('day', e."earned_at") + interval '1 day'`;
  if (granularity === "MONTH")
    return Prisma.sql`date_trunc('month', e."earned_at") + interval '1 month'`;
  return Prisma.sql`${to}::timestamptz`;
}

function financePeriodStart(granularity: ReportGranularity, source: "e" | "p", from: Date) {
  const timestamp = source === "e" ? Prisma.sql`e."earned_at"` : Prisma.sql`p."requested_at"`;
  if (granularity === "DAY") return Prisma.sql`date_trunc('day', ${timestamp})`;
  if (granularity === "MONTH") return Prisma.sql`date_trunc('month', ${timestamp})`;
  return Prisma.sql`${from}::timestamptz`;
}

interface SettlementAggregateRow {
  availableAmountMinor: bigint;
  currency: string;
  earningCount: bigint;
  grossAmountMinor: bigint;
  heldAmountMinor: bigint;
  organizationDisplayName: string;
  organizationId: string;
  organizationType: string;
  paidAmountMinor: bigint;
  payableAmountMinor: bigint;
  periodEnd: Date;
  periodStart: Date;
  reservedAmountMinor: bigint;
}

function mapSettlementAggregate(row: SettlementAggregateRow) {
  const earningCount = Number(row.earningCount);
  if (!Number.isSafeInteger(earningCount)) {
    throw new Error("Settlement report earning count exceeds the supported safe integer range.");
  }
  return {
    availableAmountMinor: row.availableAmountMinor.toString(),
    currency: row.currency,
    earningCount,
    grossAmountMinor: row.grossAmountMinor.toString(),
    heldAmountMinor: row.heldAmountMinor.toString(),
    organization: {
      displayName: row.organizationDisplayName,
      id: row.organizationId,
      type: row.organizationType,
    },
    paidAmountMinor: row.paidAmountMinor.toString(),
    payableAmountMinor: row.payableAmountMinor.toString(),
    periodEnd: row.periodEnd.toISOString(),
    periodStart: row.periodStart.toISOString(),
    reservedAmountMinor: row.reservedAmountMinor.toString(),
  };
}

function mapPayout(row: {
  currency: string;
  executedByPrincipalId?: string | null;
  executionStartedAt?: Date | null;
  id: string;
  organization: { displayName: string; id: string; type: string };
  paidAt: Date | null;
  payoutNumber: string;
  providerCode?: string | null;
  providerReference?: string | null;
  requestedAmountMinor: bigint;
  requestedAt: Date;
  reviewReasonCode: string | null;
  reviewedAt: Date | null;
  status: string;
  version: number;
}) {
  return {
    ...row,
    paidAt: row.paidAt?.toISOString() ?? null,
    executedByPrincipalId: row.executedByPrincipalId ?? null,
    executionStartedAt: row.executionStartedAt?.toISOString() ?? null,
    requestedAmountMinor: row.requestedAmountMinor.toString(),
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function mapStatement(row: {
  currency: string;
  earningCount: number;
  finalizedAt: Date;
  grossAmountMinor: bigint;
  heldAmountMinor: bigint;
  id: string;
  organization: { displayName: string; id: string; type: string };
  payableAmountMinor: bigint;
  periodEnd: Date;
  periodStart: Date;
  settlementNumber: string;
  status: string;
}) {
  return {
    ...row,
    finalizedAt: row.finalizedAt.toISOString(),
    grossAmountMinor: row.grossAmountMinor.toString(),
    heldAmountMinor: row.heldAmountMinor.toString(),
    payableAmountMinor: row.payableAmountMinor.toString(),
    periodEnd: row.periodEnd.toISOString(),
    periodStart: row.periodStart.toISOString(),
  };
}

interface AdvancedFinanceRow {
  currency: string;
  earningCount: bigint;
  failedPayoutCount: bigint;
  grossAmountMinor: bigint;
  heldAmountMinor: bigint;
  paidAmountMinor: bigint;
  payableAmountMinor: bigint;
  payoutCount: bigint;
  periodStart: Date;
  reconciliationCount: bigint;
}

function mapAdvancedFinance(row: AdvancedFinanceRow) {
  const counts = [
    row.earningCount,
    row.failedPayoutCount,
    row.payoutCount,
    row.reconciliationCount,
  ].map(Number);
  if (counts.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("Finance report count exceeds the supported safe integer range.");
  }
  return {
    currency: row.currency,
    earningCount: counts[0],
    failedPayoutCount: counts[1],
    grossAmountMinor: row.grossAmountMinor.toString(),
    heldAmountMinor: row.heldAmountMinor.toString(),
    paidAmountMinor: row.paidAmountMinor.toString(),
    payableAmountMinor: row.payableAmountMinor.toString(),
    payoutCount: counts[2],
    periodStart: row.periodStart.toISOString(),
    reconciliationCount: counts[3],
  };
}
