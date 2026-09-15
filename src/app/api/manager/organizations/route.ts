// GET /api/manager/organizations
// Paginated, filterable portfolio list for the signed-in manager (plan §3.3).
// Row summaries (last payment, earnings, open tickets) are fetched in
// grouped queries over the CURRENT PAGE only — no N+1 per row.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize, OPEN_TICKET_STATUSES } from "@/lib/manager-constants";
import type { ManagerOrganization, ManagerRelationshipStatus } from "@/types";

// The list projection — business fields only (privacy allowlist, plan §9).
const PHARMACY_LIST_SELECT = {
  id: true,
  pharmacyNumber: true,
  name: true,
  city: true,
  state: true,
  verificationStatus: true,
  createdAt: true,
  acquiredByManagerId: true,
  acquiredAt: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
} as const;

const LABORATORY_LIST_SELECT = {
  id: true,
  laboratoryNumber: true,
  name: true,
  city: true,
  state: true,
  verificationStatus: true,
  createdAt: true,
  acquiredByManagerId: true,
  acquiredAt: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
} as const;

type ListRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  verificationStatus: string;
  createdAt: Date;
  acquiredByManagerId: string | null;
  acquiredAt: Date | null;
  managerAssignedAt: Date | null;
  managerRelationshipStatus: string | null;
};

/** Map a list row + batched summaries into the client portfolio shape. */
function toPortfolioRow(
  row: ListRow,
  organizationType: "pharmacy" | "laboratory",
  organizationNumber: string,
  pay: { paidAt: Date | null; amount: number | null } | undefined,
  totalEarnings: number,
  openTicketCount: number
): ManagerOrganization {
  return {
    id: row.id,
    organizationType,
    organizationNumber,
    name: row.name,
    city: row.city,
    state: row.state,
    verificationStatus: row.verificationStatus,
    relationshipStatus: (row.managerRelationshipStatus ?? "active") as ManagerRelationshipStatus,
    dateAssigned: row.managerAssignedAt ? row.managerAssignedAt.toISOString() : null,
    acquiredByManagerId: row.acquiredByManagerId,
    acquiredAt: row.acquiredAt ? row.acquiredAt.toISOString() : null,
    lastPaymentAt: pay?.paidAt ? pay.paidAt.toISOString() : null,
    lastPaymentAmount: pay?.amount ?? null,
    totalEarnings,
    openTicketCount,
  };
}

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "all"; // all | pharmacy | laboratory
    const status = url.searchParams.get("status") ?? "active"; // active | paused | ended
    const verification = url.searchParams.get("verification") ?? "all";
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    const orgFilter = {
      currentManagerId: manager.id,
      managerRelationshipStatus: status,
      ...(verification === "all" ? {} : { verificationStatus: verification }),
      ...(search ? { name: { contains: search } } : {}), // SQLite LIKE: case-insensitive for ASCII
    };

    const [pharmacies, laboratories, pharmacyTotal, laboratoryTotal] = await Promise.all([
      type === "laboratory"
        ? Promise.resolve([] as (ListRow & { pharmacyNumber: string })[])
        : db.pharmacy.findMany({
            where: orgFilter,
            select: PHARMACY_LIST_SELECT,
            orderBy: { name: "asc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
      type === "pharmacy"
        ? Promise.resolve([] as (ListRow & { laboratoryNumber: string })[])
        : db.laboratory.findMany({
            where: orgFilter,
            select: LABORATORY_LIST_SELECT,
            orderBy: { name: "asc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
      type === "laboratory" ? Promise.resolve(0) : db.pharmacy.count({ where: orgFilter }),
      type === "pharmacy" ? Promise.resolve(0) : db.laboratory.count({ where: orgFilter }),
    ]);

    // Batched summaries for this page's ids (3 grouped queries, not per-row).
    const pharmacyIds = pharmacies.map((p) => p.id);
    const laboratoryIds = laboratories.map((l) => l.id);
    const allIds = [...pharmacyIds, ...laboratoryIds];

    const [paymentStats, earningStats, ticketStats] = await Promise.all([
      db.organizationPayment.groupBy({
        by: ["pharmacyId", "laboratoryId"],
        where: {
          status: "successful",
          OR: [{ pharmacyId: { in: pharmacyIds } }, { laboratoryId: { in: laboratoryIds } }],
        },
        _max: { paidAt: true },
        _sum: { amount: true },
      }),
      db.managerEarning.groupBy({
        by: ["organizationId"],
        where: { managerId: manager.id, organizationId: { in: allIds } },
        _sum: { amount: true },
      }),
      db.supportTicket.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: allIds }, status: { in: OPEN_TICKET_STATUSES } },
        _count: { _all: true },
      }),
    ]);

    const lastPayment = new Map<string, { paidAt: Date | null; amount: number | null }>();
    for (const row of paymentStats) {
      const key = row.pharmacyId ?? row.laboratoryId;
      if (key) lastPayment.set(key, { paidAt: row._max.paidAt, amount: row._sum.amount });
    }
    const earningsByOrg = new Map(earningStats.map((e) => [e.organizationId, e._sum.amount ?? 0]));
    const ticketsByOrg = new Map(ticketStats.map((t) => [t.organizationId, t._count._all]));

    const items: ManagerOrganization[] = [
      ...pharmacies.map((p) =>
        toPortfolioRow(p, "pharmacy", p.pharmacyNumber, lastPayment.get(p.id), earningsByOrg.get(p.id) ?? 0, ticketsByOrg.get(p.id) ?? 0)
      ),
      ...laboratories.map((l) =>
        toPortfolioRow(l, "laboratory", l.laboratoryNumber, lastPayment.get(l.id), earningsByOrg.get(l.id) ?? 0, ticketsByOrg.get(l.id) ?? 0)
      ),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ data: items, meta: { page, pageSize, total: pharmacyTotal + laboratoryTotal } });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/organizations]", error);
    return NextResponse.json({ error: "Failed to load portfolio." }, { status: 500 });
  }
}
