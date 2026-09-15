// GET /api/admin/managers
// Admin-scoped manager directory (plan §3.8). Same { data, meta } contract as
// the /api/manager/* routes, but guarded by the admin session instead of a
// manager session. Per-manager counts (portfolio size, open tickets, pending
// applications) are computed with DB groupBy over the current page only.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize, OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

const PENDING_APPLICATION_STATUSES = ["submitted", "under_review", "information_required"];

export async function GET(req: Request) {
  try {
    await getAdminContext(req);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    // status=all|pending|active|suspended — mapped onto verification and
    // employment status sensibly for the directory's quick filters.
    let statusWhere: Record<string, unknown> = {};
    if (status === "pending") {
      statusWhere = { verificationStatus: "pending" };
    } else if (status === "active") {
      statusWhere = {
        verificationStatus: "verified",
        employmentStatus: { notIn: ["suspended", "offboarding"] },
      };
    } else if (status === "suspended") {
      statusWhere = {
        OR: [{ verificationStatus: "suspended" }, { employmentStatus: "suspended" }],
      };
    } else if (status !== "all") {
      return NextResponse.json(
        { error: "status must be one of all, pending, active, suspended." },
        { status: 400 }
      );
    }

    const where = {
      ...statusWhere,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { managerNumber: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };

    const [managers, total] = await Promise.all([
      db.manager.findMany({
        where,
        orderBy: { joinedAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          managerNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          territory: true,
          employmentStatus: true,
          verificationStatus: true,
          joinedAt: true,
        },
      }),
      db.manager.count({ where }),
    ]);

    // --- per-manager counts for the current page (DB groupBy, not React) ---
    const ids = managers.map((m) => m.id);
    const [pharmacyGroups, laboratoryGroups, ticketGroups, applicationGroups] = ids.length
      ? await Promise.all([
          db.pharmacy.groupBy({
            by: ["currentManagerId"],
            where: { currentManagerId: { in: ids }, managerRelationshipStatus: "active" },
            _count: { _all: true },
          }),
          db.laboratory.groupBy({
            by: ["currentManagerId"],
            where: { currentManagerId: { in: ids }, managerRelationshipStatus: "active" },
            _count: { _all: true },
          }),
          db.supportTicket.groupBy({
            by: ["managerId"],
            where: { managerId: { in: ids }, status: { in: OPEN_TICKET_STATUSES } },
            _count: { _all: true },
          }),
          db.managerOrganizationApplication.groupBy({
            by: ["managerId"],
            where: { managerId: { in: ids }, status: { in: PENDING_APPLICATION_STATUSES } },
            _count: { _all: true },
          }),
        ])
      : [[], [], [], []];

    const lookup = (rows: Record<string, unknown>[], key: string) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const k = row[key];
        if (typeof k === "string") map.set(k, (row._count as { _all: number })._all);
      }
      return map;
    };

    const pharmacyMap = lookup(pharmacyGroups as Record<string, unknown>[], "currentManagerId");
    const laboratoryMap = lookup(laboratoryGroups as Record<string, unknown>[], "currentManagerId");
    const ticketMap = lookup(ticketGroups as Record<string, unknown>[], "managerId");
    const applicationMap = lookup(applicationGroups as Record<string, unknown>[], "managerId");

    return NextResponse.json({
      data: managers.map((m) => ({
        id: m.id,
        managerNumber: m.managerNumber,
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        phone: m.phone,
        city: m.city,
        state: m.state,
        territory: m.territory,
        employmentStatus: m.employmentStatus,
        verificationStatus: m.verificationStatus,
        joinedAt: m.joinedAt,
        portfolio: {
          total: (pharmacyMap.get(m.id) ?? 0) + (laboratoryMap.get(m.id) ?? 0),
          pharmacies: pharmacyMap.get(m.id) ?? 0,
          laboratories: laboratoryMap.get(m.id) ?? 0,
        },
        openTickets: ticketMap.get(m.id) ?? 0,
        pendingApplications: applicationMap.get(m.id) ?? 0,
      })),
      meta: { page, pageSize, total },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/managers]", error);
    return NextResponse.json({ error: "Failed to load managers." }, { status: 500 });
  }
}
