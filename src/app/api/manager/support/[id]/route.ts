// GET /api/manager/support/[id]
// Ticket detail with the message timeline. Visibility rules (plan §3.7):
// managers see `shared` + `manager_internal` messages; `admin_internal`
// notes are filtered out server-side.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { manager } = await getManagerContext(req);
    const { id } = await ctx.params;
    const ticket = await db.supportTicket.findFirst({
      where: { id, managerId: manager.id },
      select: { id: true, ticketNumber: true, organizationName: true, creatorName: true, category: true, status: true, lastActivityAt: true, escalationDepartment: true },
    });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    return NextResponse.json({ data: { id: ticket.id, ticketNumber: ticket.ticketNumber, displayName: ticket.organizationName || ticket.creatorName, category: ticket.category, status: ticket.status, lastActivityAt: ticket.lastActivityAt, escalationDepartment: ticket.escalationDepartment } });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/support/[id]]", error);
    return NextResponse.json({ error: "Failed to load ticket." }, { status: 500 });
  }
}
