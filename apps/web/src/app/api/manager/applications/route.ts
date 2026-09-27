// GET /api/manager/applications
// Privacy-safe status-only view for enrollments attributed to the manager.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize } from "@/lib/manager-constants";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    const where = {
      managerId: manager.id,
      ...(status === "all" ? {} : { status }),
    };

    const [items, patientItems, total, patientTotal, counts, patientCounts] = await Promise.all([
      db.managerOrganizationApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, applicationNumber: true, organizationType: true, status: true, submittedAt: true, createdAt: true, reviewedAt: true, reviewerNote: true },
      }),
      db.managerPatientApplication.findMany({ where: { managerId: manager.id, ...(status === "all" ? {} : { status }) }, orderBy: { createdAt: "desc" }, take: pageSize, select: { id: true, applicationNumber: true, status: true, submittedAt: true, createdAt: true, reviewedAt: true, reviewerNote: true } }),
      db.managerOrganizationApplication.count({ where }),
      db.managerPatientApplication.count({ where: { managerId: manager.id, ...(status === "all" ? {} : { status }) } }),
      db.managerOrganizationApplication.groupBy({
        by: ["status"],
        where: { managerId: manager.id },
        _count: { _all: true },
      }),
      db.managerPatientApplication.groupBy({ by: ["status"], where: { managerId: manager.id }, _count: { _all: true } }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of [...counts, ...patientCounts]) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + row._count._all;
    const data = [
      ...items.map((item) => ({ ...item, submittedAt: item.submittedAt ?? item.createdAt, enrollmentType: item.organizationType })),
      ...patientItems.map((item) => ({ ...item, submittedAt: item.submittedAt ?? item.createdAt, enrollmentType: "patient" })),
    ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, pageSize);

    return NextResponse.json({ data, meta: { page, pageSize, total: total + patientTotal, statusCounts } });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/applications]", error);
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }
}
