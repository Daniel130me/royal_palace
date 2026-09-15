// GET /api/manager/organizations/[id]?type=pharmacy|laboratory
// Organization detail for the signed-in manager (plan §3.3).
// Access is enforced against the portfolio; the response is built from
// explicit allowlists so no patient/clinical field can leak.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertOrganizationInPortfolio,
  getManagerContext,
  LABORATORY_SELECT,
  ManagerAccessError,
  PHARMACY_SELECT,
  toManagerOrganizationDto,
} from "@/lib/manager-access";
import { OPEN_TICKET_STATUSES } from "@/lib/manager-constants";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { manager } = await getManagerContext(req);
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "laboratory" ? "laboratory" : "pharmacy";

    await assertOrganizationInPortfolio(manager.id, type, id);

    // Organization row via allowlist projection.
    const org =
      type === "pharmacy"
        ? await db.pharmacy.findUnique({ where: { id }, select: PHARMACY_SELECT })
        : await db.laboratory.findUnique({ where: { id }, select: LABORATORY_SELECT });
    if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const [payments, earnings, tickets, assignmentHistory] = await Promise.all([
      db.organizationPayment.findMany({
        where: type === "pharmacy" ? { pharmacyId: id } : { laboratoryId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, paymentNumber: true, transactionType: true, amount: true, currency: true,
          method: true, status: true, reference: true, paidAt: true, refundedAt: true, refundAmount: true, createdAt: true,
        },
      }),
      db.managerEarning.findMany({
        where: { managerId: manager.id, organizationId: id },
        orderBy: { occurredAt: "desc" },
        take: 50,
        select: {
          id: true, earningNumber: true, paymentNumber: true, paymentType: true, eligibleAmount: true,
          rateBps: true, amount: true, entryType: true, status: true, occurredAt: true, payoutRequestId: true,
        },
      }),
      db.supportTicket.findMany({
        where: { organizationId: id, managerId: manager.id },
        orderBy: { lastActivityAt: "desc" },
        take: 25,
        select: {
          id: true, ticketNumber: true, subject: true, category: true, priority: true, status: true,
          lastActivityAt: true, createdAt: true,
          _count: { select: { messages: true } },
        },
      }),
      db.managerAssignment.findMany({
        where: type === "pharmacy" ? { pharmacyId: id } : { laboratoryId: id },
        orderBy: { startsAt: "desc" },
        select: {
          id: true, managerId: true, source: true, relationshipStatus: true, startsAt: true, endsAt: true,
          assignedBy: true, reason: true,
          manager: { select: { firstName: true, lastName: true, managerNumber: true } },
        },
      }),
    ]);

    const openTickets = tickets.filter((t) => OPEN_TICKET_STATUSES.includes(t.status as never)).length;

    return NextResponse.json({
      data: {
        organization: toManagerOrganizationDto(org, type),
        payments,
        earnings,
        tickets: tickets.map((t) => ({ ...t, messageCount: t._count.messages, open: OPEN_TICKET_STATUSES.includes(t.status as never) })),
        openTickets,
        assignmentHistory: assignmentHistory.map((a) => ({
          ...a,
          managerName: `${a.manager.firstName} ${a.manager.lastName}`,
          managerNumber: a.manager.managerNumber,
          manager: undefined,
        })),
      },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/organizations/[id]]", error);
    return NextResponse.json({ error: "Failed to load organization." }, { status: 500 });
  }
}
