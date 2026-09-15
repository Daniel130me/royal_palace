// GET /api/manager/earnings
// Manager Earnings ledger for the signed-in manager (plan §3.5).
// Serves the Earnings page (status breakdown) and the Transactions page
// (payment-to-earning explanation) — filter with entryType/status.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize } from "@/lib/manager-constants";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const entryType = url.searchParams.get("entryType") ?? "all";
    const type = url.searchParams.get("type") ?? "all"; // organization type filter
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    const where = {
      managerId: manager.id,
      ...(status === "all" ? {} : { status }),
      ...(entryType === "all" ? {} : { entryType }),
      ...(type === "all" ? {} : { organizationType: type }),
      ...(search ? { organizationName: { contains: search } } : {}),
    };

    const [items, total, statusGroups] = await Promise.all([
      db.managerEarning.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          payoutRequest: { select: { payoutNumber: true, status: true } },
        },
      }),
      db.managerEarning.count({ where }),
      db.managerEarning.groupBy({
        by: ["status"],
        where: { managerId: manager.id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const totals: Record<string, { amount: number; count: number }> = {};
    for (const g of statusGroups) {
      totals[g.status] = { amount: g._sum.amount ?? 0, count: g._count._all };
    }

    return NextResponse.json({
      data: items.map((e) => ({
        id: e.id,
        earningNumber: e.earningNumber,
        organizationType: e.organizationType,
        organizationName: e.organizationName,
        paymentNumber: e.paymentNumber,
        paymentType: e.paymentType,
        eligibleAmount: e.eligibleAmount,
        rateBps: e.rateBps,
        amount: e.amount,
        entryType: e.entryType,
        status: e.status,
        occurredAt: e.occurredAt,
        payoutNumber: e.payoutRequest?.payoutNumber ?? null,
        payoutStatus: e.payoutRequest?.status ?? null,
      })),
      meta: { page, pageSize, total, totals },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/earnings]", error);
    return NextResponse.json({ error: "Failed to load earnings." }, { status: 500 });
  }
}
