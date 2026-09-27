// GET /api/admin/manager-data
// One admin-scoped endpoint serving the Manager oversight views (plan §3.8):
//   view=rules         revenue share rules (+ recent ledger + totals by manager)
//   view=payouts       PayoutRequest rows for managers (display only)
//   view=applications  organization applications across ALL statuses
//   view=escalations   tickets escalated to Royal Palace (read-only)
// Omit `view` (or use view=all) to fetch every section at once. Each section
// is paginated with { page, pageSize, total }.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
import { clampPageSize } from "@/lib/manager-constants";

const ESCALATED_TICKET_STATUSES = ["escalated_to_royal_palace", "royal_palace_investigating"];

const VIEWS = ["rules", "payouts", "applications", "escalations", "all"] as const;
type View = (typeof VIEWS)[number];

export async function GET(req: Request) {
  try {
    await getAdminContext(req);

    const url = new URL(req.url);
    const viewParam = url.searchParams.get("view") ?? "all";
    if (!VIEWS.includes(viewParam as View)) {
      return NextResponse.json(
        { error: "view must be one of rules, payouts, applications, escalations, all." },
        { status: 400 }
      );
    }
    const view = viewParam as View;
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));
    const skip = (page - 1) * pageSize;
    const applicationStatus = url.searchParams.get("status") ?? "all";

    const managerSelect = { select: { firstName: true, lastName: true, managerNumber: true } };
    const managerName = (m?: { firstName: string; lastName: string; managerNumber: string } | null) =>
      m ? `${m.firstName} ${m.lastName}` : "—";

    // --- rules (+ ledger + totals powering the admin earnings page) ---------
    if (view === "rules" || view === "all") {
      const [rules, ruleTotal, ledgerRows, ledgerTotal, statusGroups, reversalGroups] =
        await Promise.all([
          db.managerRevenueShareRule.findMany({
            include: { manager: managerSelect },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.managerRevenueShareRule.count(),
          db.managerEarning.findMany({
            orderBy: { occurredAt: "desc" },
            skip,
            take: pageSize,
            include: { manager: managerSelect },
          }),
          db.managerEarning.count(),
          db.managerEarning.groupBy({
            by: ["managerId", "status"],
            _sum: { amount: true },
            _count: { _all: true },
          }),
          db.managerEarning.groupBy({
            by: ["managerId"],
            where: { entryType: "reversal" },
            _sum: { amount: true },
          }),
        ]);

      // Resolve the manager names for the totals block (depends on the
      // groupBy results above, so it runs as a second round trip).
      const totalManagerIds = [
        ...new Set([...statusGroups.map((g) => g.managerId), ...reversalGroups.map((g) => g.managerId)]),
      ];
      const earningManagers = totalManagerIds.length
        ? await db.manager.findMany({
            where: { id: { in: totalManagerIds } },
            select: { id: true, firstName: true, lastName: true, managerNumber: true },
          })
        : [];

      const nameOf = new Map(earningManagers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
      const number = new Map(earningManagers.map((m) => [m.id, m.managerNumber]));
      const totalsMap = new Map<string, { managerId: string; managerName: string; managerNumber: string; pending: number; available: number; paid: number; reversed: number }>();
      for (const g of statusGroups) {
        const row =
          totalsMap.get(g.managerId) ??
          {
            managerId: g.managerId,
            managerName: nameOf.get(g.managerId) ?? "—",
            managerNumber: number.get(g.managerId) ?? "—",
            pending: 0,
            available: 0,
            paid: 0,
            reversed: 0,
          };
        if (g.status === "pending") row.pending = g._sum.amount ?? 0;
        else if (g.status === "available") row.available = g._sum.amount ?? 0;
        else if (g.status === "paid") row.paid = g._sum.amount ?? 0;
        totalsMap.set(g.managerId, row);
      }
      for (const g of reversalGroups) {
        const row = totalsMap.get(g.managerId);
        if (row) row.reversed = Math.abs(g._sum.amount ?? 0);
      }

      const rulesPayload = {
        rules: rules.map((r) => ({
          id: r.id,
          managerId: r.managerId,
          managerName: managerName(r.manager),
          managerNumber: r.manager?.managerNumber ?? "—",
          organizationType: r.organizationType,
          transactionType: r.transactionType,
          rateBps: r.rateBps,
          effectiveFrom: r.effectiveFrom,
          effectiveUntil: r.effectiveUntil,
          status: r.status,
          createdBy: r.createdBy,
          approvedBy: r.approvedBy,
          createdAt: r.createdAt,
        })),
        ledger: ledgerRows.map((e) => ({
          id: e.id,
          earningNumber: e.earningNumber,
          managerId: e.managerId,
          managerName: managerName(e.manager),
          managerNumber: e.manager?.managerNumber ?? "—",
          organizationName: e.organizationName,
          organizationType: e.organizationType,
          paymentNumber: e.paymentNumber,
          paymentType: e.paymentType,
          eligibleAmount: e.eligibleAmount,
          rateBps: e.rateBps,
          amount: e.amount,
          entryType: e.entryType,
          status: e.status,
          occurredAt: e.occurredAt,
        })),
        totals: [...totalsMap.values()].sort((a, b) => a.managerName.localeCompare(b.managerName)),
      };

      if (view === "rules") {
        return NextResponse.json({
          data: rulesPayload,
          meta: {
            rules: { page, pageSize, total: ruleTotal },
            ledger: { page, pageSize, total: ledgerTotal },
          },
        });
      }
      // view=all — fetch the remaining sections too.
      const [payouts, payoutTotal, applications, applicationTotal, escalations, escalationTotal] =
        await Promise.all([payoutSection(), payoutCount(), applicationSection(), applicationCount(), escalationSection(), escalationCount()]);
      return NextResponse.json({
        data: {
          ...rulesPayload,
          payouts,
          applications,
          escalations,
        },
        meta: {
          rules: { page, pageSize, total: ruleTotal },
          ledger: { page, pageSize, total: ledgerTotal },
          payouts: { page, pageSize, total: payoutTotal },
          applications: { page, pageSize, total: applicationTotal },
          escalations: { page, pageSize, total: escalationTotal },
        },
      });
    }

    // --- payouts (manager payout requests — display only) --------------------
    if (view === "payouts") {
      const [rows, total] = await Promise.all([payoutSection(), payoutCount()]);
      return NextResponse.json({ data: rows, meta: { page, pageSize, total } });
    }

    // --- applications (all statuses, for the review console) -----------------
    if (view === "applications") {
      const [rows, total] = await Promise.all([applicationSection(), applicationCount()]);
      return NextResponse.json({ data: rows, meta: { page, pageSize, total } });
    }

    // --- escalations (read-only tickets at Royal Palace) ---------------------
    const [rows, total] = await Promise.all([escalationSection(), escalationCount()]);
    return NextResponse.json({ data: rows, meta: { page, pageSize, total } });

    // -------------------------------------------------------------------------
    async function payoutSection() {
      const rows = await db.payoutRequest.findMany({
        where: { entityType: "manager" },
        include: { manager: managerSelect },
        orderBy: { requestedAt: "desc" },
        skip,
        take: pageSize,
      });
      return rows.map((p) => ({
        id: p.id,
        payoutNumber: p.payoutNumber,
        managerId: p.managerId,
        managerName: managerName(p.manager),
        managerNumber: p.manager?.managerNumber ?? "—",
        amountRequested: p.amountRequested,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        status: p.status,
        method: p.method,
        notes: p.notes,
        requestedAt: p.requestedAt,
        processedAt: p.processedAt,
        adminNote: p.adminNote,
      }));
    }
    async function payoutCount() {
      return db.payoutRequest.count({ where: { entityType: "manager" } });
    }

    async function applicationSection() {
      const [rows, patientRows] = await Promise.all([db.managerOrganizationApplication.findMany({
        where: applicationStatus === "all" ? {} : { status: applicationStatus },
        include: { manager: managerSelect },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }), db.managerPatientApplication.findMany({
        where: applicationStatus === "all" ? {} : { status: applicationStatus },
        include: { manager: managerSelect }, orderBy: { createdAt: "desc" }, skip, take: pageSize,
      })]);
      const patients = patientRows.length ? await db.patient.findMany({ where: { id: { in: patientRows.map((row) => row.patientId) } } }) : [];
      const patientById = new Map(patients.map((patient) => [patient.id, patient]));
      return [...rows.map((a) => ({
        id: a.id,
        enrollmentType: a.organizationType,
        applicationNumber: a.applicationNumber,
        managerId: a.managerId,
        managerName: managerName(a.manager),
        managerNumber: a.manager?.managerNumber ?? "—",
        organizationType: a.organizationType,
        businessName: a.businessName,
        contactPerson: a.contactPerson,
        contactEmail: a.contactEmail,
        contactPhone: a.contactPhone,
        address: a.address,
        city: a.city,
        state: a.state,
        registrationNumber: a.registrationNumber,
        licenceNumber: a.licenceNumber,
        notes: a.notes,
        status: a.status,
        submittedAt: a.submittedAt,
        reviewedAt: a.reviewedAt,
        reviewerId: a.reviewerId,
        reviewerNote: a.reviewerNote,
        createdAt: a.createdAt,
      })), ...patientRows.map((a) => {
        const patient = patientById.get(a.patientId);
        return { id: a.id, enrollmentType: "patient", applicationNumber: a.applicationNumber, managerId: a.managerId, managerName: managerName(a.manager), managerNumber: a.manager?.managerNumber ?? "—", patientId: a.patientId, patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown patient", patientEmail: patient?.email ?? "", patientPhone: patient?.phone ?? "", city: patient?.city ?? "", state: patient?.state ?? "", status: a.status, submittedAt: a.submittedAt, reviewedAt: a.reviewedAt, reviewerId: a.reviewerId, reviewerNote: a.reviewerNote, createdAt: a.createdAt };
      })].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, pageSize);
    }
    async function applicationCount() {
      const where = applicationStatus === "all" ? {} : { status: applicationStatus };
      const [organizations, patients] = await Promise.all([db.managerOrganizationApplication.count({ where }), db.managerPatientApplication.count({ where })]);
      return organizations + patients;
    }

    async function escalationSection() {
      const rows = await db.supportTicket.findMany({
        where: { status: { in: ESCALATED_TICKET_STATUSES } },
        include: { manager: managerSelect },
        orderBy: { lastActivityAt: "desc" },
        skip,
        take: pageSize,
      });
      return rows.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        organizationType: t.organizationType,
        organizationName: t.organizationName,
        managerId: t.managerId,
        managerName: managerName(t.manager),
        managerNumber: t.manager?.managerNumber ?? "—",
        creatorName: t.creatorName,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        escalationDepartment: t.escalationDepartment,
        escalationReason: t.escalationReason,
        escalatedAt: t.escalatedAt,
        createdAt: t.createdAt,
        lastActivityAt: t.lastActivityAt,
      }));
    }
    async function escalationCount() {
      return db.supportTicket.count({ where: { status: { in: ESCALATED_TICKET_STATUSES } } });
    }
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/manager-data]", error);
    return NextResponse.json({ error: "Failed to load manager data." }, { status: 500 });
  }
}
