// GET /api/manager/support
// Tickets for the signed-in manager's portfolio (plan §3.7).
// Managers only ever see tickets assigned to them (Level 1 owner).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize, OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const view = url.searchParams.get("view") ?? "all"; // all | open | escalated | resolved
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    const viewFilter =
      view === "open"
        ? { status: { in: OPEN_TICKET_STATUSES } }
        : view === "escalated"
          ? { status: { in: ["escalated_to_royal_palace", "royal_palace_investigating"] } }
          : view === "resolved"
            ? { status: { in: ["resolved", "closed"] } }
            : {};

    const where = {
      managerId: manager.id,
      ...viewFilter,
      ...(status === "all" ? {} : { status }),
      ...(search ? { OR: [{ subject: { contains: search } }, { organizationName: { contains: search } }] } : {}),
    };

    const [items, total, statusGroups] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, ticketNumber: true, organizationType: true, organizationId: true, organizationName: true,
          subject: true, category: true, priority: true, status: true, escalationDepartment: true,
          escalatedAt: true, resolution: true, resolvedAt: true, lastActivityAt: true, createdAt: true,
          _count: { select: { messages: true } },
        },
      }),
      db.supportTicket.count({ where }),
      db.supportTicket.groupBy({ by: ["status"], where: { managerId: manager.id }, _count: { _all: true } }),
    ]);

    const statusCounts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

    return NextResponse.json({
      data: items.map((t) => ({ ...t, messageCount: t._count.messages })),
      meta: { page, pageSize, total, statusCounts },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/support]", error);
    return NextResponse.json({ error: "Failed to load support tickets." }, { status: 500 });
  }
}
