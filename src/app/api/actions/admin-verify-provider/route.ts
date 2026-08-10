// POST /api/actions/admin-verify-provider
// Admin approves / rejects / requests-info / suspends / reactivates a provider.
// Updates the provider + providerApplication, writes verification history,
// emits audit + notifications.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { providerId, action, notes, actorId } = await req.json();
  // action: approve | reject | request_info | suspend | reactivate
  if (!providerId || !action) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const provider = await db.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

  const map: Record<string, { status: string; note: string }> = {
    approve: { status: "approved", note: "Provider application approved." },
    reject: { status: "rejected", note: "Provider application rejected." },
    request_info: { status: "additional_information_requested", note: "Additional information requested." },
    suspend: { status: "suspended", note: "Provider suspended." },
    reactivate: { status: "approved", note: "Provider reactivated." },
  };
  const target = map[action];
  if (!target) return NextResponse.json({ error: "Unknown verification action." }, { status: 400 });

  const updated = await db.provider.update({
    where: { id: providerId },
    data: { verificationStatus: target.status },
  });

  const app = await db.providerApplication.findFirst({ where: { providerId }, orderBy: { submittedAt: "desc" } });
  if (app) {
    const history = JSON.parse(app.history ?? "[]");
    history.push({ status: target.status, at: new Date().toISOString(), by: "Royal Palace Admin", note: notes ?? target.note });
    await db.providerApplication.update({
      where: { id: app.id },
      data: {
        status: target.status,
        reviewedAt: new Date(),
        reviewerId: actorId ?? "USR-ADMIN",
        reviewerNotes: notes ?? target.note,
        history: JSON.stringify(history),
      },
    });
  }

  await audit({
    actorId: actorId ?? "ADM-001",
    actorRole: "admin",
    action: `admin_${action}_provider`,
    entityType: "provider",
    entityId: providerId,
    description: `${provider.title} ${provider.firstName} ${provider.lastName}: ${target.note}`,
  });
  await notify({
    recipientId: providerId,
    recipientType: "provider",
    title: "Verification update",
    body: target.note,
    type: "system",
    relatedId: providerId,
  });

  return NextResponse.json({ data: updated });
}
