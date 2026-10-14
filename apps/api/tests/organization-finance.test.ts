import type { Prisma } from "../src/generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";

import { projectOrganizationEarning } from "../src/finance/infrastructure/prisma-organization-finance.repository.js";
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
});
