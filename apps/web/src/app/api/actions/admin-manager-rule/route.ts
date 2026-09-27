// POST /api/actions/admin-manager-rule
// Admin creates or retires revenue-share rules (plan §3.8 / §4).
// Rates are integer basis points (10000 = 100%). Creating a rule that
// overlaps an existing active rule for the same scope/window is REJECTED —
// the earnings engine refuses to guess between overlapping rules.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";
const ACTIVITY_TYPES = ["consultation", "pharmacy", "laboratory", "hospital"] as const;

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const body = await req.json();
    const { action, managerId, activityType, rateBps, effectiveFrom, ruleId } = body ?? {};

    if (action === "retire") {
      if (!ruleId) return NextResponse.json({ error: "ruleId is required." }, { status: 400 });
      const rule = await db.managerRevenueShareRule.update({
        where: { id: ruleId },
        data: { status: "retired", effectiveUntil: new Date() },
      });
      await db.auditLog.create({
        data: {
          id: genId("AUD"),
          actorId: admin.profileId ?? admin.userId,
          actorRole: "admin",
          action: "manager_rule_retired",
          entityType: "manager_revenue_share_rule",
          entityId: rule.id,
          description: `Revenue share rule ${rule.id} (${rule.organizationType}/${rule.transactionType}, ${rule.rateBps}bps) retired.`,
        },
      });
      return NextResponse.json({ data: rule });
    }

    if (action !== "create") {
      return NextResponse.json({ error: "action must be create or retire." }, { status: 400 });
    }

    // --- create ---
    if (!ACTIVITY_TYPES.includes(activityType)) return NextResponse.json({ error: `activityType must be one of ${ACTIVITY_TYPES.join(", ")}.` }, { status: 400 });
    if (!Number.isInteger(rateBps) || rateBps <= 0 || rateBps > 10_000) {
      return NextResponse.json({ error: "rateBps must be an integer between 1 and 10000." }, { status: 400 });
    }
    const manager = await db.manager.findUnique({ where: { id: managerId } });
    if (!manager) return NextResponse.json({ error: "Manager not found." }, { status: 404 });

    const from = effectiveFrom ? new Date(effectiveFrom) : new Date();

    // Overlap guard: any active rule for the same scope still open at `from`.
    const overlapping = await db.managerRevenueShareRule.findFirst({
      where: {
        managerId,
        activityType,
        status: "active",
        effectiveFrom: { lte: from },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: from } }],
      },
    });
    if (overlapping) {
      return NextResponse.json(
        { error: `An active rule for ${activityType} activity already covers this period. Retire it first.` },
        { status: 409 }
      );
    }

    const rule = await db.managerRevenueShareRule.create({
      data: {
        id: genId("MRR"),
        managerId,
        activityType,
        organizationType: activityType,
        transactionType: "patient_payment",
        rateBps,
        effectiveFrom: from,
        status: "active",
        createdBy: admin.profileId ?? admin.userId,
        approvedBy: admin.profileId ?? admin.userId,
      },
    });

    await db.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: admin.profileId ?? admin.userId,
        actorRole: "admin",
        action: "manager_rule_created",
        entityType: "manager_revenue_share_rule",
        entityId: rule.id,
        description: `Revenue share rule created: ${manager.firstName} ${manager.lastName}, ${activityType} activity at ${rateBps}bps.`,
      },
    });
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: managerId,
        recipientType: "manager",
        title: "Revenue share rule configured",
        body: `A ${activityType} activity rule at ${(rateBps / 100).toFixed(2)}% is now active for you.`,
        type: "manager",
        relatedId: rule.id,
        read: false,
      },
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin-manager-rule]", error);
    return NextResponse.json({ error: "Failed to save revenue share rule." }, { status: 500 });
  }
}
