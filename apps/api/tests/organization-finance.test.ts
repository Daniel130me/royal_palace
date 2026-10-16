import type { Prisma } from "../src/generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";

import {
  PrismaOrganizationFinanceRepository,
  projectOrganizationEarning,
} from "../src/finance/infrastructure/prisma-organization-finance.repository.js";
import { ConfiguredPayoutGateway } from "../src/finance/infrastructure/configured-payout.gateway.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

function payment() {
  return {
    amountMinor: 12_500n,
    currency: "NGN",
    id: createOpaqueId(),
    laboratoryBooking: {
      laboratoryOrganizationId: createOpaqueId(),
      laboratoryPayoutMinor: 10_000n,
    },
    purpose: "LABORATORY_BOOKING",
  };
}

describe("organization earning projection", () => {
  it("creates exactly one immutable earning projection for a successful laboratory payment", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const transaction = { organizationEarning: { upsert } } as unknown as Prisma.TransactionClient;
    const source = payment();

    await projectOrganizationEarning(transaction, source, {
      eventType: "SUCCEEDED",
      occurredAt: new Date("2026-10-14T12:00:00.000Z"),
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          grossAmountMinor: source.amountMinor,
          organizationId: source.laboratoryBooking.laboratoryOrganizationId,
          payableAmountMinor: source.laboratoryBooking.laboratoryPayoutMinor,
          paymentId: source.id,
        }),
        update: {},
        where: { paymentId: source.id },
      }),
    );
  });

  it("holds unpaid earnings and flags reserved payout requests after a negative payment event", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const earningId = createOpaqueId();
    const payoutRequestId = createOpaqueId();
    const transaction = {
      organizationEarning: {
        findUnique: vi.fn().mockResolvedValue({
          id: earningId,
          payoutAllocations: [{ payoutRequestId, payoutRequest: { status: "REQUESTED" } }],
          settlementAllocation: null,
        }),
        update,
      },
      organizationPayoutRequest: { updateMany },
    } as unknown as Prisma.TransactionClient;

    await projectOrganizationEarning(transaction, payment(), {
      eventType: "REFUNDED",
      occurredAt: new Date("2026-10-14T13:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ holdReasonCode: "PAYMENT_REFUNDED", status: "ON_HOLD" }),
        where: { id: earningId },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REVIEW_REQUIRED" }),
        where: expect.objectContaining({ id: { in: [payoutRequestId] } }),
      }),
    );
  });

  it("does not create organization earnings for unrelated payment purposes", async () => {
    const upsert = vi.fn();
    const transaction = { organizationEarning: { upsert } } as unknown as Prisma.TransactionClient;
    await projectOrganizationEarning(
      transaction,
      { ...payment(), purpose: "CONSULTATION" },
      {
        eventType: "SUCCEEDED",
        occurredAt: new Date(),
      },
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("flags a finalized statement for reconciliation after a negative payment event", async () => {
    const settlementId = createOpaqueId();
    const settlementUpdate = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      organizationEarning: {
        findUnique: vi.fn().mockResolvedValue({
          id: createOpaqueId(),
          payoutAllocations: [],
          settlementAllocation: { settlementId },
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      organizationPayoutRequest: { updateMany: vi.fn() },
      organizationSettlement: { update: settlementUpdate },
    } as unknown as Prisma.TransactionClient;

    await projectOrganizationEarning(transaction, payment(), {
      eventType: "REVERSED",
      occurredAt: new Date("2026-10-14T13:00:00.000Z"),
    });

    expect(settlementUpdate).toHaveBeenCalledWith({
      data: { status: "RECONCILIATION_REQUIRED" },
      where: { id: settlementId },
    });
  });
});

describe("organization settlement reports", () => {
  it("maps database aggregates without loading individual earnings", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        availableAmountMinor: 7_000n,
        currency: "NGN",
        earningCount: 2n,
        grossAmountMinor: 12_500n,
        heldAmountMinor: 1_000n,
        organizationDisplayName: "Synthetic Diagnostics",
        organizationId: createOpaqueId(),
        organizationType: "LABORATORY",
        paidAmountMinor: 1_000n,
        payableAmountMinor: 10_000n,
        periodEnd: new Date("2026-10-15T00:00:00.000Z"),
        periodStart: new Date("2026-10-14T00:00:00.000Z"),
        reservedAmountMinor: 1_000n,
      },
    ]);
    const repository = new PrismaOrganizationFinanceRepository({ $queryRaw: queryRaw } as never);

    const report = await repository.listSettlementReport({
      from: new Date("2026-10-14T00:00:00.000Z"),
      granularity: "DAY",
      to: new Date("2026-10-15T00:00:00.000Z"),
    });

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(report.data).toEqual([
      expect.objectContaining({
        availableAmountMinor: "7000",
        currency: "NGN",
        earningCount: 2,
        grossAmountMinor: "12500",
        heldAmountMinor: "1000",
        paidAmountMinor: "1000",
        payableAmountMinor: "10000",
        periodEnd: "2026-10-15T00:00:00.000Z",
        periodStart: "2026-10-14T00:00:00.000Z",
        reservedAmountMinor: "1000",
      }),
    ]);
  });
});

describe("configured payout gateway", () => {
  it("uses a stable provider reference for local idempotent execution", async () => {
    const gateway = new ConfiguredPayoutGateway({ payoutGateway: { mode: "synthetic" } } as never);
    const claim = {
      amountMinor: "10000",
      currency: "NGN",
      organizationId: createOpaqueId(),
      payoutId: createOpaqueId(),
      payoutNumber: "PAYOUT-TEST",
    };
    const first = await gateway.execute(claim);
    const second = await gateway.execute(claim);

    expect(first).toEqual(second);
    expect(first.providerCode).toBe("synthetic");
  });

  it("fails closed when payout execution is disabled", async () => {
    const gateway = new ConfiguredPayoutGateway({ payoutGateway: { mode: "disabled" } } as never);
    await expect(
      gateway.execute({
        amountMinor: "10000",
        currency: "NGN",
        organizationId: createOpaqueId(),
        payoutId: createOpaqueId(),
        payoutNumber: "PAYOUT-TEST",
      }),
    ).rejects.toThrow("payout_gateway_disabled");
  });
});
