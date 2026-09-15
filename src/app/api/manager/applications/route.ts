// GET /api/manager/applications
// Organization applications submitted by the signed-in manager (plan §3.4).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize } from "@/lib/manager-constants";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const type = url.searchParams.get("type") ?? "all";
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    const where = {
      managerId: manager.id,
      ...(status === "all" ? {} : { status }),
      ...(type === "all" ? {} : { organizationType: type }),
      ...(search ? { businessName: { contains: search } } : {}),
    };

    const [items, total, counts] = await Promise.all([
      db.managerOrganizationApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.managerOrganizationApplication.count({ where }),
      db.managerOrganizationApplication.groupBy({
        by: ["status"],
        where: { managerId: manager.id },
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

    return NextResponse.json({ data: items, meta: { page, pageSize, total, statusCounts } });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/applications]", error);
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }
}
