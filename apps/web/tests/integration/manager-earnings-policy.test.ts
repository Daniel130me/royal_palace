// DB-backed tests for the earnings policy core (plan §10):
// - active rule resolution by date/type + overlap rejection
// - idempotent earning creation (duplicate confirmation creates ONE earning)
// - refunds produce clamped reversals
// - payout allocation cannot exceed or double-allocate the balance

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import {
  calculateAvailableBalance,
  createEarningForPayment,
  createReversalForRefund,
  resolveActiveRule,
  selectEarningsForPayout,
} from "@/lib/manager-earnings-policy";

let seq = 0;
const uniq = (prefix: string) => `${prefix}-T${++seq}`;

async function seedOrg(type: "pharmacy" | "laboratory") {
  const id = uniq(type === "pharmacy" ? "PHX" : "LBX");
  const userId = uniq("USR");
  await db.user.create({
    data: { id: userId, email: `${id}@t.test`, password: "x", role: type, status: "active", profileId: id, name: id },
  });
  return type === "pharmacy"
    ? db.pharmacy.create({ data: { id, userId, pharmacyNumber: uniq("N"), name: `Pharmacy ${id}`, city: "Lagos", state: "Lagos", address: "a", phone: "p", email: `${id}@t.test` } })
    : db.laboratory.create({ data: { id, userId, laboratoryNumber: uniq("N"), name: `Lab ${id}`, city: "Lagos", state: "Lagos", address: "a", phone: "p", email: `${id}@t.test` } });
}

async function seedManager() {
  const id = uniq("MGR");
  const userId = uniq("USR");
  await db.user.create({
    data: { id: userId, email: `${id}@t.test`, password: "x", role: "manager", status: "active", profileId: id, name: id },
  });
  return db.manager.create({
    data: {
      id, userId, managerNumber: uniq("MN"), onboardingCode: uniq("OC"),
      firstName: "Test", lastName: "Manager", email: `${id}@t.test`, phone: "p",
      city: "Lagos", state: "Lagos", territory: "T",
    },
  });
}

async function seedPayment(organizationType: "pharmacy" | "laboratory", pharmacyId?: string, laboratoryId?: string) {
  return db.organizationPayment.create({
    data: {
      id: genId("ORGP"), paymentNumber: uniq("ORGP-N"), organizationType, pharmacyId, laboratoryId,
      transactionType: "subscription", amount: 1_000, status: "successful", reference: uniq("ref"), paidAt: new Date(),
    },
  });
}

beforeEach(async () => {
  // Clean only the tables this suite writes, in FK-safe order.
  await db.managerEarning.deleteMany();
  await db.managerRevenueShareRule.deleteMany();
  await db.managerAssignment.deleteMany();
  await db.organizationPayment.deleteMany();
  await db.manager.deleteMany();
  await db.pharmacy.deleteMany({ where: { id: { contains: "-T" } } });
  await db.laboratory.deleteMany({ where: { id: { contains: "-T" } } });
  await db.user.deleteMany({ where: { id: { contains: "-T" } } });
  await db.auditLog.deleteMany({ where: { id: { contains: "-T" } } });
  await db.notification.deleteMany({ where: { id: { contains: "-T" } } });
});

describe("resolveActiveRule", () => {
  it("returns the rule in effect for the scope and time", async () => {
    const manager = await seedManager();
    const from = new Date("2026-01-01T00:00:00Z");
    await db.managerRevenueShareRule.create({
      data: { id: genId("MRR"), managerId: manager.id, organizationType: "pharmacy", transactionType: "subscription", rateBps: 300, effectiveFrom: from, status: "active", createdBy: "ADM-001" },
    });

    const rule = await resolveActiveRule(db, manager.id, "pharmacy", "subscription", new Date("2026-06-01T00:00:00Z"));
    expect(rule?.rateBps).toBe(300);
  });

  it("returns null when no rule covers the scope", async () => {
    const manager = await seedManager();
    const rule = await resolveActiveRule(db, manager.id, "laboratory", "platform_fee", new Date());
    expect(rule).toBeNull();
  });

  it("honours effectiveUntil windows", async () => {
    const manager = await seedManager();
    await db.managerRevenueShareRule.create({
      data: {
        id: genId("MRR"), managerId: manager.id, organizationType: "pharmacy", transactionType: "subscription",
        rateBps: 300, effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: new Date("2026-02-01T00:00:00Z"),
        status: "active", createdBy: "ADM-001",
      },
    });
    const inside = await resolveActiveRule(db, manager.id, "pharmacy", "subscription", new Date("2026-01-15T00:00:00Z"));
    const after = await resolveActiveRule(db, manager.id, "pharmacy", "subscription", new Date("2026-03-01T00:00:00Z"));
    expect(inside?.rateBps).toBe(300);
    expect(after).toBeNull();
  });

  it("throws when two active rules overlap the same scope", async () => {
    const manager = await seedManager();
    const from = new Date("2026-01-01T00:00:00Z");
    for (const rateBps of [300, 500]) {
      await db.managerRevenueShareRule.create({
        data: { id: genId("MRR"), managerId: manager.id, organizationType: "pharmacy", transactionType: "subscription", rateBps, effectiveFrom: from, status: "active", createdBy: "ADM-001" },
      });
    }
    await expect(
      resolveActiveRule(db, manager.id, "pharmacy", "subscription", new Date("2026-06-01T00:00:00Z"))
    ).rejects.toThrow(/Overlapping/);
  });
});

describe("createEarningForPayment", () => {
  it("creates one earning and is idempotent on duplicate confirmation", async () => {
    const manager = await seedManager();
    const pharmacy = await seedOrg("pharmacy");
    await db.managerAssignment.create({
      data: {
        id: genId("MAS"), managerId: manager.id, organizationType: "pharmacy", pharmacyId: pharmacy.id,
        source: "acquisition", relationshipStatus: "active", startsAt: new Date(Date.now() - 86_400_000), assignedBy: "ADM-001", reason: "test",
      },
    });
    await db.managerRevenueShareRule.create({
      data: { id: genId("MRR"), managerId: manager.id, organizationType: "pharmacy", transactionType: "subscription", rateBps: 300, effectiveFrom: new Date(Date.now() - 86_400_000), status: "active", createdBy: "ADM-001" },
    });

    const paidAt = new Date();
    const payment = await db.organizationPayment.create({
      data: {
        id: genId("ORGP"), paymentNumber: uniq("ORGP-N"), organizationType: "pharmacy", pharmacyId: pharmacy.id,
        transactionType: "subscription", amount: 120_000, status: "successful", reference: uniq("ref"), paidAt,
      },
    });

    const first = await createEarningForPayment(payment.id);
    const second = await createEarningForPayment(payment.id);

    expect(first).not.toBeNull();
    expect(first).not.toBe("already_processed");
    if (first && first !== "already_processed") {
      expect(first.amount).toBe(3_600); // round(120000 * 300 / 10000)
      expect(first.rateBps).toBe(300); // snapshot
      expect(first.organizationName).toBe(pharmacy.name); // snapshot
    }
    expect(second).toBe("already_processed");
    expect(await db.managerEarning.count({ where: { organizationPaymentId: payment.id } })).toBe(1);
  });

  it("does not invent an earning when no rule exists", async () => {
    const manager = await seedManager();
    const pharmacy = await seedOrg("pharmacy");
    await db.managerAssignment.create({
      data: {
        id: genId("MAS"), managerId: manager.id, organizationType: "pharmacy", pharmacyId: pharmacy.id,
        source: "admin_assignment", relationshipStatus: "active", startsAt: new Date(Date.now() - 86_400_000), assignedBy: "ADM-001", reason: "test",
      },
    });
    const payment = await db.organizationPayment.create({
      data: {
        id: genId("ORGP"), paymentNumber: uniq("ORGP-N"), organizationType: "pharmacy", pharmacyId: pharmacy.id,
        transactionType: "platform_fee", amount: 50_000, status: "successful", reference: uniq("ref"), paidAt: new Date(),
      },
    });
    const result = await createEarningForPayment(payment.id);
    expect(result).toBeNull();
    expect(await db.managerEarning.count()).toBe(0);
  });

  it("credits the historically correct assignment when the org was reassigned", async () => {
    const managerA = await seedManager();
    const managerB = await seedManager();
    const pharmacy = await seedOrg("pharmacy");

    // Old assignment (ended) covering the payment moment.
    await db.managerAssignment.create({
      data: {
        id: genId("MAS"), managerId: managerA.id, organizationType: "pharmacy", pharmacyId: pharmacy.id,
        source: "acquisition", relationshipStatus: "ended",
        startsAt: new Date(Date.now() - 10 * 86_400_000), endsAt: new Date(Date.now() - 3 * 86_400_000),
        assignedBy: "ADM-001", reason: "history",
      },
    });
    await db.managerRevenueShareRule.create({
      data: { id: genId("MRR"), managerId: managerA.id, organizationType: "pharmacy", transactionType: "subscription", rateBps: 300, effectiveFrom: new Date(Date.now() - 11 * 86_400_000), status: "active", createdBy: "ADM-001" },
    });

    // Payment made while manager A was still in force.
    const paidAt = new Date(Date.now() - 5 * 86_400_000);
    const payment = await db.organizationPayment.create({
      data: {
        id: genId("ORGP"), paymentNumber: uniq("ORGP-N"), organizationType: "pharmacy", pharmacyId: pharmacy.id,
        transactionType: "subscription", amount: 100_000, status: "successful", reference: uniq("ref"), paidAt,
      },
    });

    const earning = await createEarningForPayment(payment.id);
    expect(earning).not.toBeNull();
    expect(earning && earning !== "already_processed" ? earning.managerId : null).toBe(managerA.id);
  });
});

describe("createReversalForRefund", () => {
  it("creates a negative reversal and clamps cumulative reversals to the original", async () => {
    const manager = await seedManager();
    const pharmacy = await seedOrg("pharmacy");
    await db.managerAssignment.create({
      data: {
        id: genId("MAS"), managerId: manager.id, organizationType: "pharmacy", pharmacyId: pharmacy.id,
        source: "acquisition", relationshipStatus: "active", startsAt: new Date(Date.now() - 86_400_000), assignedBy: "ADM-001", reason: "test",
      },
    });
    await db.managerRevenueShareRule.create({
      data: { id: genId("MRR"), managerId: manager.id, organizationType: "pharmacy", transactionType: "subscription", rateBps: 300, effectiveFrom: new Date(Date.now() - 86_400_000), status: "active", createdBy: "ADM-001" },
    });

    const payment = await db.organizationPayment.create({
      data: {
        id: genId("ORGP"), paymentNumber: uniq("ORGP-N"), organizationType: "pharmacy", pharmacyId: pharmacy.id,
        transactionType: "subscription", amount: 100_000, status: "successful", reference: uniq("ref"), paidAt: new Date(),
      },
    });
    const earning = await createEarningForPayment(payment.id);
    expect(earning && earning !== "already_processed" ? earning.amount : null).toBe(3_000);

    await db.organizationPayment.update({
      where: { id: payment.id },
      data: { status: "refunded", refundedAt: new Date(), refundAmount: 100_000 },
    });

    const reversal = await createReversalForRefund(payment.id);
    expect(reversal?.amount).toBe(-3_000);
    expect(reversal?.reversalOfId).toBe((earning as { id: string }).id);

    // A second refund attempt must not over-reverse.
    const second = await createReversalForRefund(payment.id);
    expect(second).toBeNull();
    const total = await db.managerEarning.aggregate({ where: { organizationPaymentId: payment.id }, _sum: { amount: true } });
    expect(total._sum.amount).toBe(0); // fully netted
  });
});

describe("payout allocation", () => {
  it("excludes earnings already allocated to a payout from the balance", async () => {
    const manager = await seedManager();
    const pharmacy = await seedOrg("pharmacy");
    const payment = await seedPayment("pharmacy", pharmacy.id, undefined);
    const payout = await db.payoutRequest.create({
      data: {
        id: genId("MGP"), payoutNumber: uniq("MGP-N"), entityType: "manager", entityId: manager.id,
        managerId: manager.id, entityName: "Test", amountRequested: 1_000, periodStart: "2026-01-01", periodEnd: "2026-01-31",
      },
    });
    await db.managerEarning.create({
      data: {
        id: genId("MGE"), earningNumber: uniq("MGE-N"), eventKey: uniq("ek"), managerId: manager.id,
        organizationPaymentId: payment.id, organizationType: "pharmacy", organizationId: pharmacy.id, organizationName: "x",
        paymentType: "subscription", paymentNumber: payment.paymentNumber, eligibleAmount: 1_000, rateBps: 300, amount: 1_000,
        entryType: "earning", status: "available", occurredAt: new Date(), payoutRequestId: payout.id,
      },
    });
    await db.managerEarning.create({
      data: {
        id: genId("MGE"), earningNumber: uniq("MGE-N"), eventKey: uniq("ek"), managerId: manager.id,
        organizationPaymentId: payment.id, organizationType: "pharmacy", organizationId: pharmacy.id, organizationName: "x",
        paymentType: "subscription", paymentNumber: payment.paymentNumber, eligibleAmount: 2_000, rateBps: 300, amount: 2_000,
        entryType: "earning", status: "available", occurredAt: new Date(),
      },
    });
    expect(await calculateAvailableBalance(manager.id)).toBe(2_000);
  });

  it("allocates whole entries FIFO and never above the request", async () => {
    const manager = await seedManager();
    const pharmacy = await seedOrg("pharmacy");
    const payment = await seedPayment("pharmacy", pharmacy.id, undefined);
    const amounts = [2_880, 2_400, 4_000];
    for (const amount of amounts) {
      await db.managerEarning.create({
        data: {
          id: genId("MGE"), earningNumber: uniq("MGE-N"), eventKey: uniq("ek"), managerId: manager.id,
          organizationPaymentId: payment.id, organizationType: "pharmacy", organizationId: pharmacy.id, organizationName: "x",
          paymentType: "subscription", paymentNumber: payment.paymentNumber, eligibleAmount: amount, rateBps: 300, amount,
          entryType: "earning", status: "available", occurredAt: new Date(),
        },
      });
    }

    // Request 5,280 -> allocates 2,880 + 2,400 exactly (4,000 does not fit).
    const selected = await selectEarningsForPayout(manager.id, 5_280);
    expect(selected.map((e) => e.amount).sort((a, b) => a - b)).toEqual([2_400, 2_880]);

    // Request smaller than the first entry -> nothing allocatable.
    expect(await selectEarningsForPayout(manager.id, 1_000)).toEqual([]);
  });
});
