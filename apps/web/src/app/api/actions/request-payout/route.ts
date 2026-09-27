// POST /api/actions/request-payout
// A provider, pharmacy, laboratory or logistics requests a payout of their
// accrued earnings. Creates a PayoutRequest record (status "requested") for
// admin to review. The commission removed by Royal Palace is NEVER shown to
// the requesting entity — they only see their gross and net.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

const ENTITY_LABELS: Record<string, string> = {
  provider: "Provider",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  logistics: "Logistics",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, entityId, amountRequested, periodStart, periodEnd, notes, actorId } = body ?? {};

  if (!entityType || !entityId || !amountRequested) {
    return NextResponse.json({ error: "Entity type, entity id and amount are required." }, { status: 400 });
  }
  if (!["provider", "pharmacy", "laboratory", "logistics"].includes(entityType)) {
    return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });
  }

  // Resolve entity name for display.
  let entityName = ENTITY_LABELS[entityType];
  if (entityType === "provider") {
    const p = await db.provider.findUnique({ where: { id: entityId } });
    if (!p) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    entityName = `${p.title} ${p.firstName} ${p.lastName}`;
  } else if (entityType === "pharmacy") {
    const p = await db.pharmacy.findUnique({ where: { id: entityId } });
    if (!p) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
    entityName = p.name;
  } else if (entityType === "laboratory") {
    const p = await db.laboratory.findUnique({ where: { id: entityId } });
    if (!p) return NextResponse.json({ error: "Laboratory not found." }, { status: 404 });
    entityName = p.name;
  } else if (entityType === "logistics") {
    const p = await db.logisticsProvider.findUnique({ where: { id: entityId } });
    if (!p) return NextResponse.json({ error: "Logistics provider not found." }, { status: 404 });
    entityName = p.name;
  }

  const today = new Date().toISOString().slice(0, 10);
  const payout = await db.payoutRequest.create({
    data: {
      id: genId("PAYR"),
      payoutNumber: genId("RPH-PAYR"),
      entityType,
      entityId,
      entityName,
      amountRequested: Number(amountRequested),
      periodStart: periodStart ?? today,
      periodEnd: periodEnd ?? today,
      status: "requested",
      method: "bank_transfer",
      notes: notes ?? null,
    },
  });

  await audit({
    actorId: actorId ?? entityId,
    actorRole: entityType,
    action: `${entityType}_requested_payout`,
    entityType: "payout_request",
    entityId: payout.id,
    description: `${entityName} requested a payout of ₦${Number(amountRequested).toLocaleString()}.`,
  });
  await notify({
    recipientId: "ADM-001",
    recipientType: "admin",
    title: "New payout request",
    body: `${entityName} requested a payout of ₦${Number(amountRequested).toLocaleString()}.`,
    type: "system",
    relatedId: payout.id,
  });

  return NextResponse.json({ data: payout }, { status: 201 });
}
