// GET /api/admin/managers/[id]
// Admin view of one manager (plan §3.8): profile, portfolio rows with
// acquisition/current-manager attribution, full assignment history, revenue
// share rules and earnings totals by status. Guarded by the admin session.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getAdminContext,
  ManagerAccessError,
  PHARMACY_SELECT,
  LABORATORY_SELECT,
  toManagerOrganizationDto,
} from "@/lib/manager-access";
import { OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

const PENDING_APPLICATION_STATUSES = ["submitted", "under_review", "information_required"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await getAdminContext(req);
    const { id } = await ctx.params;

    const manager = await db.manager.findUnique({ where: { id } });
    if (!manager) {
      return NextResponse.json({ error: "Manager not found." }, { status: 404 });
    }

    const [pharmacies, laboratories, assignments, rules, earningGroups, reversalAgg, openTickets, pendingApplications] =
      await Promise.all([
        // Portfolio includes both currently-managed and previously-attributed
        // organizations so the attribution fields stay visible to admins.
        db.pharmacy.findMany({
          where: { OR: [{ currentManagerId: id }, { acquiredByManagerId: id }] },
          select: PHARMACY_SELECT,
          orderBy: { createdAt: "asc" },
        }),
        db.laboratory.findMany({
          where: { OR: [{ currentManagerId: id }, { acquiredByManagerId: id }] },
          select: LABORATORY_SELECT,
          orderBy: { createdAt: "asc" },
        }),
        db.managerAssignment.findMany({
          where: { managerId: id },
          orderBy: { startsAt: "desc" },
          include: {
            pharmacy: { select: { name: true } },
            laboratory: { select: { name: true } },
          },
        }),
        db.managerRevenueShareRule.findMany({
          where: { managerId: id },
          orderBy: { effectiveFrom: "desc" },
        }),
        db.managerEarning.groupBy({
          by: ["status"],
          where: { managerId: id },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        // Gross refund impact (an earning + its reversal pair both carry the
        // "reversed" status, so the status-group sum would net to zero).
        db.managerEarning.aggregate({
          where: { managerId: id, entryType: "reversal" },
          _sum: { amount: true },
        }),
        db.supportTicket.count({
          where: { managerId: id, status: { in: OPEN_TICKET_STATUSES } },
        }),
        db.managerOrganizationApplication.count({
          where: { managerId: id, status: { in: PENDING_APPLICATION_STATUSES } },
        }),
      ]);

    const portfolio = [
      ...pharmacies.map((p) => toManagerOrganizationDto(p, "pharmacy")),
      ...laboratories.map((l) => toManagerOrganizationDto(l, "laboratory")),
    ];

    const totals: Record<string, { amount: number; count: number }> = {};
    for (const g of earningGroups) {
      totals[g.status] = { amount: g._sum.amount ?? 0, count: g._count._all };
    }
    totals.reversed = {
      amount: Math.abs(reversalAgg._sum.amount ?? 0),
      count: totals.reversed?.count ?? 0,
    };

    return NextResponse.json({
      data: {
        manager: {
          id: manager.id,
          managerNumber: manager.managerNumber,
          onboardingCode: manager.onboardingCode,
          firstName: manager.firstName,
          lastName: manager.lastName,
          email: manager.email,
          phone: manager.phone,
          city: manager.city,
          state: manager.state,
          territory: manager.territory,
          employmentStatus: manager.employmentStatus,
          verificationStatus: manager.verificationStatus,
          joinedAt: manager.joinedAt,
        },
        stats: {
          portfolioSize: portfolio.filter((p) => p.currentManagerId === id && p.managerRelationshipStatus === "active").length,
          acquiredCount: portfolio.filter((p) => p.acquiredByManagerId === id).length,
          openTickets,
          pendingApplications,
        },
        portfolio,
        assignments: assignments.map((a) => ({
          id: a.id,
          organizationType: a.organizationType,
          organizationName: a.pharmacy?.name ?? a.laboratory?.name ?? "—",
          source: a.source,
          relationshipStatus: a.relationshipStatus,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          assignedBy: a.assignedBy,
          reason: a.reason,
        })),
        rules,
        earnings: { totals },
      },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/managers/[id]]", error);
    return NextResponse.json({ error: "Failed to load manager." }, { status: 500 });
  }
}
