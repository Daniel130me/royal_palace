// GET /api/manager/support/[id]
// Ticket detail with the message timeline. Visibility rules (plan §3.7):
// managers see `shared` + `manager_internal` messages; `admin_internal`
// notes are filtered out server-side.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertTicketInPortfolio, getManagerContext, ManagerAccessError } from "@/lib/manager-access";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { manager } = await getManagerContext(req);
    const { id } = await ctx.params;
    await assertTicketInPortfolio(manager.id, id);

    const ticket = await db.supportTicket.findUnique({
      where: { id },
      include: {
        messages: {
          where: { visibility: { in: ["shared", "manager_internal"] } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    return NextResponse.json({ data: ticket });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/support/[id]]", error);
    return NextResponse.json({ error: "Failed to load ticket." }, { status: 500 });
  }
}
