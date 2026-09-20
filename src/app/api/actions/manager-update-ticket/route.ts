import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";

const ACTIONS = ["follow_up", "escalate"] as const;

export async function POST(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const { ticketId, action, message } = await req.json();
    if (!ACTIONS.includes(action) || !message?.trim()) return NextResponse.json({ error: "A valid action and short note are required." }, { status: 400 });
    const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, managerId: manager.id } });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    const updated = await db.$transaction(async (tx) => {
      await tx.supportTicketMessage.create({ data: { id: genId("TKM"), ticketId, actorId: manager.id, actorRole: "manager", actorName: `${manager.firstName} ${manager.lastName}`, body: message.trim(), visibility: "admin_internal" } });
      const result = await tx.supportTicket.update({ where: { id: ticketId }, data: { status: action === "escalate" ? "escalated_to_royal_palace" : ticket.status, ...(action === "escalate" ? { escalationDepartment: "Support", escalationReason: message.trim(), escalatedAt: new Date() } : {}), lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { id: genId("AUD"), actorId: manager.id, actorRole: "manager", action: `manager_ticket_${action}`, entityType: "support_ticket", entityId: ticketId, description: `${ticket.ticketNumber} ${action.replace("_", " ")} recorded.` } });
      return result;
    });
    await db.notification.create({ data: { id: genId("NTF"), recipientId: "ADM-001", recipientType: "admin", title: `Manager ${action.replace("_", " ")}`, body: `${updated.ticketNumber} requires support review.`, type: "system", relatedId: updated.id, read: false } });
    return NextResponse.json({ data: { id: updated.id, status: updated.status } });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[manager-update-ticket]", error);
    return NextResponse.json({ error: "Failed to update ticket." }, { status: 500 });
  }
}
