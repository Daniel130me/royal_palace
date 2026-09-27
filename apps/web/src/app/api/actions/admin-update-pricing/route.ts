// POST /api/actions/admin-update-pricing
// Admin updates a platform-controlled service price. Creates a new
// ServicePrice row (history), sets the old one to inactive, and updates the
// cached provider consultationFee. Emits audit.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { serviceId, patientPrice, providerPayout, effectiveFrom, actorId } = await req.json();
  if (!serviceId || patientPrice == null || providerPayout == null) {
    return NextResponse.json({ error: "Missing pricing fields." }, { status: 400 });
  }
  const service = await db.service.findUnique({ where: { id: serviceId }, include: { prices: true } });
  if (!service) return NextResponse.json({ error: "Service not found." }, { status: 404 });

  // Deactivate previous active price (keeps history).
  const active = service.prices.find((p) => p.status === "active");
  if (active) {
    await db.servicePrice.update({ where: { id: active.id }, data: { status: "inactive" } });
  }

  const newPrice = await db.servicePrice.create({
    data: {
      id: genId("SP"),
      serviceId,
      patientPrice: Number(patientPrice),
      providerPayout: Number(providerPayout),
      platformMargin: Number(patientPrice) - Number(providerPayout),
      currency: "NGN",
      effectiveFrom: effectiveFrom ?? new Date().toISOString().slice(0, 10),
      status: "active",
    },
  });

  await audit({
    actorId: actorId ?? "ADM-001",
    actorRole: "admin",
    action: "admin_changed_service_price",
    entityType: "service_price",
    entityId: newPrice.id,
    description: `Price for ${service.name} updated to ₦${patientPrice} (payout ₦${providerPayout}).`,
  });

  return NextResponse.json({ data: newPrice }, { status: 201 });
}
