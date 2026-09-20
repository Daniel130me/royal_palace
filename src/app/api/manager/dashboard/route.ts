import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

/** Manager-safe dashboard: attribution counts and earnings only. */
export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const managerId = manager.id;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const [patients, pharmacies, laboratories, hospitals, orgApplications, patientApplications] = await Promise.all([
      db.patient.count({ where: { acquiredByManagerId: managerId } }),
      db.pharmacy.count({ where: { acquiredByManagerId: managerId } }),
      db.laboratory.count({ where: { acquiredByManagerId: managerId } }),
      db.hospital.count({ where: { acquiredByManagerId: managerId } }),
      db.managerOrganizationApplication.groupBy({ by: ["status"], where: { managerId }, _count: { _all: true } }),
      db.managerPatientApplication.groupBy({ by: ["status"], where: { managerId }, _count: { _all: true } }),
    ]);
    const pendingStatuses = new Set(["submitted", "under_review", "information_required"]);
    const applications = [...orgApplications, ...patientApplications];
    const pendingReview = applications.reduce((sum, row) => sum + (pendingStatuses.has(row.status) ? row._count._all : 0), 0);
    const approved = applications.reduce((sum, row) => sum + (row.status === "approved" ? row._count._all : 0), 0);
    const earningGroups = await db.managerEarning.groupBy({ by: ["status"], where: { managerId }, _sum: { amount: true } });
    const earnings = { thisMonth: 0, pending: 0, available: 0, paid: 0, reversed: 0 };
    for (const row of earningGroups) {
      const amount = row._sum.amount ?? 0;
      if (row.status === "pending") earnings.pending = amount;
      if (row.status === "available") earnings.available = amount;
      if (row.status === "paid") earnings.paid = amount;
    }
    const [monthlyTotal, reversal, availableBalance, pendingPayout, ticketGroups, earningRows, notifications] = await Promise.all([
      db.managerEarning.aggregate({ where: { managerId, occurredAt: { gte: monthStart } }, _sum: { amount: true } }),
      db.managerEarning.aggregate({ where: { managerId, entryType: "reversal" }, _sum: { amount: true } }),
      db.managerEarning.aggregate({ where: { managerId, status: "available", payoutRequestId: null }, _sum: { amount: true } }),
      db.payoutRequest.aggregate({ where: { entityType: "manager", managerId, status: { in: ["requested", "processing"] } }, _sum: { amountRequested: true } }),
      db.supportTicket.groupBy({ by: ["status"], where: { managerId }, _count: { _all: true } }),
      db.managerEarning.findMany({ where: { managerId, occurredAt: { gte: sixMonthsAgo } }, select: { occurredAt: true, amount: true } }),
      db.notification.findMany({ where: { recipientId: managerId, recipientType: "manager" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, body: true, read: true, createdAt: true, relatedId: true } }),
    ]);
    earnings.thisMonth = monthlyTotal._sum.amount ?? 0;
    earnings.reversed = Math.abs(reversal._sum.amount ?? 0);
    const support = { open: 0, awaitingManager: 0, escalated: 0 };
    for (const row of ticketGroups) {
      if (OPEN_TICKET_STATUSES.includes(row.status as (typeof OPEN_TICKET_STATUSES)[number])) support.open += row._count._all;
      if (["new", "assigned_to_manager", "reopened"].includes(row.status)) support.awaitingManager += row._count._all;
      if (["escalated_to_royal_palace", "royal_palace_investigating"].includes(row.status)) support.escalated += row._count._all;
    }
    const sumRange = (start: Date, end: Date) => earningRows.reduce((sum, row) => sum + (row.occurredAt >= start && row.occurredAt < end ? row.amount : 0), 0);
    const monthly = Array.from({ length: 6 }, (_, index) => {
      const offset = 5 - index;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      return { month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`, earnings: sumRange(start, end) };
    });
    const daily = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate() + index);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      return { date: start.toISOString().slice(0, 10), earnings: sumRange(start, end) };
    });
    return NextResponse.json({ data: {
      manager: { id: manager.id, managerNumber: manager.managerNumber, onboardingCode: manager.onboardingCode, name: `${manager.firstName} ${manager.lastName}` },
      enrollments: { total: patients + pharmacies + laboratories + hospitals, patients, pharmacies, laboratories, hospitals, pendingReview, approved },
      earnings,
      payouts: { availableBalance: Math.max(availableBalance._sum.amount ?? 0, 0), pendingPayout: pendingPayout._sum.amountRequested ?? 0 },
      support,
      applications: { pending: pendingReview },
      monthly,
      daily,
      notifications,
    } });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[manager/dashboard]", error);
    return NextResponse.json({ error: "Failed to load dashboard." }, { status: 500 });
  }
}
