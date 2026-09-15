// POST /api/actions/manager-update-ticket
// Manager Level-1 support actions on a portfolio ticket (plan §3.7):
//   reply         — shared message, starts investigating
//   note          — manager-only working note (never shown to the org)
//   request_info  — ask the organization for information (status: waiting)
//   resolve       — requires a resolution text
//   escalate      — requires reason + department; moves to Royal Palace (L2)
// Ticket scope is enforced via assertTicketInPortfolio; all writes happen
// in one transaction with audit + notifications.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { assertTicketInPortfolio, getManagerContext, ManagerAccessError } from "@/lib/manager-access";

const ESCALATION_DEPARTMENTS = ["Finance", "Technical", "Operations", "Compliance"] as const;
const MANAGER_ACTIONS = ["reply", "note", "request_info", "resolve", "escalate"] as const;
type ManagerTicketAction = (typeof MANAGER_ACTIONS)[number];

export async function POST(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const body = await req.json();
    const { ticketId, action: ticketAction, message, resolution, department } = body ?? {};

    if (!MANAGER_ACTIONS.includes(ticketAction)) {
      return NextResponse.json({ error: `action must be one of ${MANAGER_ACTIONS.join(", ")}.` }, { status: 400 });
    }
    // Enforce required inputs per action before touching the database.
    if (ticketAction !== "note" && ticketAction !== "resolve" && !message?.trim()) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }
    if (ticketAction === "resolve" && !resolution?.trim()) {
      return NextResponse.json({ error: "A resolution summary is required to resolve a ticket." }, { status: 400 });
    }
    if (ticketAction === "escalate") {
      if (!message?.trim()) {
        return NextResponse.json({ error: "An escalation reason is required." }, { status: 400 });
      }
      if (!ESCALATION_DEPARTMENTS.includes(department)) {
        return NextResponse.json({ error: `department must be one of ${ESCALATION_DEPARTMENTS.join(", ")}.` }, { status: 400 });
      }
    }

    await assertTicketInPortfolio(manager.id, ticketId);
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (["closed"].includes(ticket.status)) {
      return NextResponse.json({ error: "This ticket is closed." }, { status: 400 });
    }

    const managerName = `${manager.firstName} ${manager.lastName}`;
    const actorBase = { actorId: manager.id, actorRole: "manager", actorName: managerName };

    const result = await db.$transaction(async (tx) => {
      const now = new Date();
      let statusUpdate: Record<string, unknown> = {};
      let messageVisibility: "shared" | "manager_internal" = "shared";
      let messageBody: string | null = (message ?? "").trim() || null;

      switch (ticketAction as ManagerTicketAction) {
        case "reply":
          if (["new", "assigned_to_manager", "reopened"].includes(ticket.status)) {
            statusUpdate = { status: "manager_investigating" };
          }
          break;
        case "note":
          messageVisibility = "manager_internal";
          break;
        case "request_info":
          statusUpdate = { status: "waiting_for_organization" };
          break;
        case "resolve":
          statusUpdate = { status: "resolved", resolution: resolution.trim(), resolvedAt: now };
          messageBody = messageBody ?? resolution.trim();
          break;
        case "escalate":
          statusUpdate = {
            status: "escalated_to_royal_palace",
            escalationDepartment: department,
            escalationReason: (message ?? "").trim(),
            escalatedAt: now,
          };
          break;
      }

      if (messageBody) {
        await tx.supportTicketMessage.create({
          data: {
            id: genId("TKM"),
            ticketId: ticket.id,
            ...actorBase,
            body:
              ticketAction === "request_info"
                ? `[Information requested] ${messageBody}`
                : ticketAction === "escalate"
                  ? `[Escalated to ${department}] ${messageBody}`
                  : ticketAction === "resolve"
                    ? `[Resolved] ${messageBody}`
                    : messageBody,
            visibility: messageVisibility,
          },
        });
      }

      const updated = await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { ...statusUpdate, lastActivityAt: now },
      });

      await tx.auditLog.create({
        data: {
          id: genId("AUD"),
          actorId: manager.id,
          actorRole: "manager",
          action: `manager_ticket_${ticketAction}`,
          entityType: "support_ticket",
          entityId: ticket.id,
          description:
            ticketAction === "escalate"
              ? `${ticket.ticketNumber} escalated to ${department} — ${(message ?? "").trim()}`
              : ticketAction === "resolve"
                ? `${ticket.ticketNumber} resolved — ${resolution.trim()}`
                : `${ticket.ticketNumber} updated by ${managerName} (${ticketAction}).`,
        },
      });

      return updated;
    });

    // Post-commit notifications.
    if (ticketAction === "escalate") {
      await db.notification.create({
        data: {
          id: genId("NTF"),
          recipientId: "ADM-001",
          recipientType: "admin",
          title: "Ticket escalated to Royal Palace",
          body: `${result.ticketNumber} (${result.organizationName}) escalated to ${department} by ${managerName}.`,
          type: "system",
          relatedId: result.id,
          read: false,
        },
      });
    }
    if (["reply", "request_info", "resolve"].includes(ticketAction)) {
      await db.notification.create({
        data: {
          id: genId("NTF"),
          recipientId: result.organizationId,
          recipientType: result.organizationType,
          title: `Ticket ${result.ticketNumber} updated`,
          body:
            ticketAction === "resolve"
              ? `Your ticket was resolved: ${resolution.trim()}`
              : ticketAction === "request_info"
                ? `${managerName} requested more information.`
                : `${managerName} replied to your ticket.`,
          type: "system",
          relatedId: result.id,
          read: false,
        },
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager-update-ticket]", error);
    return NextResponse.json({ error: "Failed to update ticket." }, { status: 500 });
  }
}
