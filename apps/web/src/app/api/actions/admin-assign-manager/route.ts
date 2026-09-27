// POST /api/actions/admin-assign-manager
// Admin assigns or reassigns an organization to a manager (plan §3.8).
// Delegates to the assignment policy so the close-old/create-new history
// pattern and the organization cache refresh happen in one transaction.
// A reason is MANDATORY.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
import { assignOrganizationToManager } from "@/lib/manager-assignment-policy";

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const body = await req.json();
    const { organizationType, organizationId, managerId, reason } = body ?? {};

    if (organizationType !== "pharmacy" && organizationType !== "laboratory") {
      return NextResponse.json({ error: "organizationType must be pharmacy or laboratory." }, { status: 400 });
    }
    if (!organizationId || !managerId) {
      return NextResponse.json({ error: "organizationId and managerId are required." }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "A reason is required for every assignment change." }, { status: 400 });
    }

    const manager = await db.manager.findUnique({ where: { id: managerId } });
    if (!manager) return NextResponse.json({ error: "Manager not found." }, { status: 404 });

    const org =
      organizationType === "pharmacy"
        ? await db.pharmacy.findUnique({ where: { id: organizationId } })
        : await db.laboratory.findUnique({ where: { id: organizationId } });
    if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const previousManagerId = org.currentManagerId;
    const previousManager = previousManagerId
      ? await db.manager.findUnique({ where: { id: previousManagerId } })
      : null;

    const assignment = await db.$transaction(async (tx) => {
      const created = await assignOrganizationToManager(
        {
          organizationType,
          organizationId,
          managerId,
          assignedBy: admin.profileId ?? admin.userId,
          source: previousManagerId ? "reassignment" : "admin_assignment",
          reason: reason.trim(),
        },
        tx
      );

      // Audit inside the same transaction (plan §4: audit/notify atomic with assignment).
      await tx.auditLog.create({
        data: {
          id: genId("AUD"),
          actorId: admin.profileId ?? admin.userId,
          actorRole: "admin",
          action: previousManagerId ? "manager_reassigned" : "admin_assigned_manager",
          entityType: organizationType,
          entityId: organizationId,
          description: previousManagerId
            ? `${org.name} (${organizationType}) reassigned from ${previousManager ? `${previousManager.firstName} ${previousManager.lastName}` : previousManagerId} to ${manager.firstName} ${manager.lastName} — ${reason.trim()}`
            : `${org.name} (${organizationType}) assigned to ${manager.firstName} ${manager.lastName} — ${reason.trim()}`,
        },
      });

      return created;
    });

    // Notifications after commit: inform the new manager (and the org).
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: manager.id,
        recipientType: "manager",
        title: previousManagerId ? "Organization reassigned to you" : "New organization in your portfolio",
        body: `${org.name} is now part of your portfolio. Reason: ${reason.trim()}`,
        type: "manager",
        relatedId: organizationId,
        read: false,
      },
    });
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: organizationId,
        recipientType: organizationType,
        title: "Manager assignment updated",
        body: `${manager.firstName} ${manager.lastName} is now your Royal Palace Manager.`,
        type: "system",
        relatedId: assignment.id,
        read: false,
      },
    });

    return NextResponse.json({ data: assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin-assign-manager]", error);
    return NextResponse.json({ error: "Failed to assign manager." }, { status: 500 });
  }
}
