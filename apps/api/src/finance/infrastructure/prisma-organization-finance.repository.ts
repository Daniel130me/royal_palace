import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { Prisma } from "../../generated/prisma/client.js";
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
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PrismaOrganizationFinanceRepository implements OrganizationFinanceRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async listSettlementReport(input: {
    from: Date;
    granularity: ReportGranularity;
    organizationId?: string;
    to: Date;
  }) {
    const rows = await this.database.organizationEarning.findMany({
      orderBy: [{ earnedAt: "desc" }, { id: "desc" }],
      select: {
        currency: true,
        earnedAt: true,
        grossAmountMinor: true,
        id: true,
        organization: { select: { displayName: true, id: true, type: true } },
        payableAmountMinor: true,
        payoutAllocations: {
          select: { amountMinor: true, payoutRequest: { select: { status: true } } },
        },
        status: true,
      },
      where: {
        earnedAt: { gte: input.from, lt: input.to },
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
      },
    });
    const grouped = new Map<string, ReturnType<typeof emptyPeriod>>();
    for (const row of rows) {
      const period = periodBounds(row.earnedAt, input.granularity, input.from, input.to);
      const key = `${row.organization.id}:${row.currency}:${period.start.toISOString()}`;
      const current = grouped.get(key) ?? emptyPeriod(row, period);
      current.grossAmountMinor += row.grossAmountMinor;
      current.payableAmountMinor += row.payableAmountMinor;
      let paidAmountMinor = 0n;
      let reservedAmountMinor = 0n;
      for (const allocation of row.payoutAllocations) {
        if (allocation.payoutRequest.status === "PAID") paidAmountMinor += allocation.amountMinor;
        else if (ACTIVE_RESERVATION_STATUSES.includes(allocation.payoutRequest.status as never)) {
          reservedAmountMinor += allocation.amountMinor;
        }
      }
      current.paidAmountMinor += paidAmountMinor;
      current.reservedAmountMinor += reservedAmountMinor;
      if (row.status !== "AVAILABLE") {
        current.heldAmountMinor += maximum(
          row.payableAmountMinor - paidAmountMinor - reservedAmountMinor,
          0n,
        );
      }
      current.earningCount += 1;
      grouped.set(key, current);
    }
    return {
      data: [...grouped.values()].map(serializePeriod),
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
        id: true,
        organization: { select: { displayName: true, id: true, type: true } },
        paidAt: true,
        payoutNumber: true,
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
          requestedByPrincipalId: { not: input.reviewedByPrincipalId },
          status: "REQUESTED",
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

function periodBounds(value: Date, granularity: ReportGranularity, from: Date, to: Date) {
  if (granularity === "TOTAL") return { end: to, start: from };
  const start =
    granularity === "DAY"
      ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const end =
    granularity === "DAY"
      ? new Date(start.getTime() + 86_400_000)
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { end, start };
}

function emptyPeriod(
  row: {
    currency: string;
    organization: { displayName: string; id: string; type: string };
  },
  period: { end: Date; start: Date },
) {
  return {
    currency: row.currency,
    earningCount: 0,
    grossAmountMinor: 0n,
    heldAmountMinor: 0n,
    organization: row.organization,
    paidAmountMinor: 0n,
    payableAmountMinor: 0n,
    periodEnd: period.end,
    periodStart: period.start,
    reservedAmountMinor: 0n,
  };
}

function serializePeriod(row: ReturnType<typeof emptyPeriod>) {
  const available = maximum(
    row.payableAmountMinor - row.heldAmountMinor - row.paidAmountMinor - row.reservedAmountMinor,
    0n,
  );
  return {
    ...row,
    availableAmountMinor: available.toString(),
    grossAmountMinor: row.grossAmountMinor.toString(),
    heldAmountMinor: row.heldAmountMinor.toString(),
    paidAmountMinor: row.paidAmountMinor.toString(),
    payableAmountMinor: row.payableAmountMinor.toString(),
    periodEnd: row.periodEnd.toISOString(),
    periodStart: row.periodStart.toISOString(),
    reservedAmountMinor: row.reservedAmountMinor.toString(),
  };
}

function maximum(left: bigint, right: bigint) {
  return left > right ? left : right;
}

function mapPayout(row: {
  currency: string;
  id: string;
  organization: { displayName: string; id: string; type: string };
  paidAt: Date | null;
  payoutNumber: string;
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
    requestedAmountMinor: row.requestedAmountMinor.toString(),
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
