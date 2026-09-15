// GET /api/manager/dashboard
// Aggregated Manager Portal dashboard (plan §3.2). Every number is computed
// in the database with count/aggregate/groupBy — never by reducing full
// tables in React. The monthly series buckets the last 6 months from small
// projection queries (platform-fee volume is bounded, so bucketing here is
// cheaper than SQL date-trunc gymnastics on SQLite).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const managerId = manager.id;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // --- portfolio counts (grouped in DB, mapped in JS over tiny results) ---
    const orgFilter = { currentManagerId: managerId, managerRelationshipStatus: "active" };
    const [pharmacyGroups, laboratoryGroups] = await Promise.all([
      db.pharmacy.groupBy({
        by: ["verificationStatus", "managerRelationshipStatus"],
        where: orgFilter,
        _count: { _all: true },
      }),
      db.laboratory.groupBy({
        by: ["verificationStatus", "managerRelationshipStatus"],
        where: orgFilter,
        _count: { _all: true },
      }),
    ]);

    const portfolio = {
      total: 0,
      pharmacies: 0,
      laboratories: 0,
      active: 0,
      pendingVerification: 0,
      inactive: 0,
      suspended: 0,
      acquiredByManager: 0,
    };
    const accumulate = (
      groups: { verificationStatus: string; _count: { _all: number } }[],
      kind: "pharmacies" | "laboratories"
    ) => {
      for (const g of groups) {
        portfolio.total += g._count._all;
        portfolio[kind] += g._count._all;
        if (g.verificationStatus === "approved") portfolio.active += g._count._all;
        else if (g.verificationStatus === "pending") portfolio.pendingVerification += g._count._all;
        else if (g.verificationStatus === "suspended") portfolio.suspended += g._count._all;
        else portfolio.inactive += g._count._all;
      }
    };
    accumulate(pharmacyGroups, "pharmacies");
    accumulate(laboratoryGroups, "laboratories");

    // Acquired-by attribution spans both current and past portfolio members.
    const [acquiredPharmacies, acquiredLaboratories] = await Promise.all([
      db.pharmacy.count({ where: { acquiredByManagerId: managerId } }),
      db.laboratory.count({ where: { acquiredByManagerId: managerId } }),
    ]);
    portfolio.acquiredByManager = acquiredPharmacies + acquiredLaboratories;

    // --- payments this month for portfolio organizations --------------------
    const paymentsThisMonth = await db.organizationPayment.aggregate({
      where: {
        status: "successful",
        paidAt: { gte: monthStart },
        OR: [{ pharmacy: { is: orgFilter } }, { laboratory: { is: orgFilter } }],
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    // --- earnings by status (grouped in DB) ----------------------------------
    const earningGroups = await db.managerEarning.groupBy({
      by: ["status"],
      where: { managerId },
      _sum: { amount: true },
    });
    const earnings = { thisMonth: 0, pending: 0, available: 0, paid: 0, reversed: 0 };
    for (const g of earningGroups) {
      const sum = g._sum.amount ?? 0;
      if (g.status === "pending") earnings.pending = sum;
      else if (g.status === "available") earnings.available = sum;
      else if (g.status === "paid") earnings.paid = sum;
      else if (g.status === "reversed") earnings.reversed = sum;
    }
    const thisMonthAgg = await db.managerEarning.aggregate({
      where: { managerId, occurredAt: { gte: monthStart } },
      _sum: { amount: true },
    });
    earnings.thisMonth = thisMonthAgg._sum.amount ?? 0;

    // --- payouts --------------------------------------------------------------
    const [availableBalance, pendingPayoutAgg] = await Promise.all([
      db.managerEarning.aggregate({
        where: { managerId, status: { in: ["available", "paid"] }, payoutRequestId: null },
        _sum: { amount: true },
      }),
      db.payoutRequest.aggregate({
        where: { entityType: "manager", managerId, status: { in: ["requested", "processing"] } },
        _sum: { amountRequested: true },
      }),
    ]);

    // --- support --------------------------------------------------------------
    const ticketGroups = await db.supportTicket.groupBy({
      by: ["status"],
      where: { managerId },
      _count: { _all: true },
    });
    const support = { open: 0, awaitingManager: 0, escalated: 0 };
    for (const g of ticketGroups) {
      if (OPEN_TICKET_STATUSES.includes(g.status as (typeof OPEN_TICKET_STATUSES)[number]))
        support.open += g._count._all;
      if (["new", "assigned_to_manager", "reopened"].includes(g.status)) support.awaitingManager += g._count._all;
      if (["escalated_to_royal_palace", "royal_palace_investigating"].includes(g.status))
        support.escalated += g._count._all;
    }

    // --- applications ----------------------------------------------------------
    const pendingApplications = await db.managerOrganizationApplication.count({
      where: { managerId, status: { in: ["submitted", "under_review", "information_required"] } },
    });

    // --- monthly series (last 6 months, bucketed from slim projections) -------
    const [paymentRows, earningRows] = await Promise.all([
      db.organizationPayment.findMany({
        where: {
          status: "successful",
          paidAt: { gte: sixMonthsAgo },
          OR: [{ pharmacy: { is: orgFilter } }, { laboratory: { is: orgFilter } }],
        },
        select: { paidAt: true, amount: true },
      }),
      db.managerEarning.findMany({
        where: { managerId, occurredAt: { gte: sixMonthsAgo } },
        select: { occurredAt: true, amount: true },
      }),
    ]);

    const monthly: { month: string; payments: number; earnings: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      const payments = paymentRows
        .filter((p) => p.paidAt && p.paidAt >= start && p.paidAt < end)
        .reduce((s, p) => s + p.amount, 0);
      const earningSum = earningRows
        .filter((e) => e.occurredAt >= start && e.occurredAt < end)
        .reduce((s, e) => s + e.amount, 0);
      monthly.push({ month: key, payments, earnings: earningSum });
    }

    // --- recent notifications --------------------------------------------------
    const notifications = await db.notification.findMany({
      where: { recipientId: managerId, recipientType: "manager" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, read: true, createdAt: true, relatedId: true },
    });

    return NextResponse.json({
      data: {
        manager: {
          id: manager.id,
          managerNumber: manager.managerNumber,
          onboardingCode: manager.onboardingCode,
          name: `${manager.firstName} ${manager.lastName}`,
        },
        portfolio,
        payments: {
          successfulThisMonth: paymentsThisMonth._sum.amount ?? 0,
          countThisMonth: paymentsThisMonth._count._all,
        },
        earnings,
        payouts: {
          availableBalance: Math.max(availableBalance._sum.amount ?? 0, 0),
          pendingPayout: pendingPayoutAgg._sum.amountRequested ?? 0,
        },
        support,
        applications: { pending: pendingApplications },
        monthly,
        notifications,
      },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/dashboard]", error);
    return NextResponse.json({ error: "Failed to load dashboard." }, { status: 500 });
  }
}
