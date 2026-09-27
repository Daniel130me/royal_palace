import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize } from "@/lib/manager-constants";

/** Earnings-only projection. Gross payments, identities and commission rates never leave this endpoint. */
export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));
    const occurredAt = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lt: new Date(`${to}T23:59:59.999`) } : {}) } : undefined;
    const where = { managerId: manager.id, ...(status === "all" ? {} : { status }), ...(occurredAt ? { occurredAt } : {}) };
    const [items, total, groups, reversal] = await Promise.all([
      db.managerEarning.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, earningNumber: true, amount: true, entryType: true, status: true, occurredAt: true, patientActivityPayment: { select: { activityType: true } }, payoutRequest: { select: { payoutNumber: true, status: true } } } }),
      db.managerEarning.count({ where }),
      db.managerEarning.groupBy({ by: ["status"], where: { managerId: manager.id }, _sum: { amount: true }, _count: { _all: true } }),
      db.managerEarning.aggregate({ where: { managerId: manager.id, entryType: "reversal" }, _sum: { amount: true } }),
    ]);
    const totals: Record<string, { amount: number; count: number }> = Object.fromEntries(groups.map((row) => [row.status, { amount: row._sum.amount ?? 0, count: row._count._all }]));
    totals.reversed = { amount: Math.abs(reversal._sum.amount ?? 0), count: totals.reversed?.count ?? 0 };
    return NextResponse.json({ data: items.map((row) => ({ id: row.id, earningNumber: row.earningNumber, activityType: row.patientActivityPayment?.activityType ?? "patient_activity", amount: row.amount, entryType: row.entryType, status: row.status, occurredAt: row.occurredAt, payoutNumber: row.payoutRequest?.payoutNumber ?? null, payoutStatus: row.payoutRequest?.status ?? null })), meta: { page, pageSize, total, totals } });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[manager/earnings]", error);
    return NextResponse.json({ error: "Failed to load earnings." }, { status: 500 });
  }
}
