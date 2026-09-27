// POST /api/actions/progress-delivery
// Validates delivery workflow transitions. When delivery becomes "delivered",
// also marks the linked pharmacy order as "delivered" and notifies the patient.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { canTransitionDelivery } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { deliveryId, status, verificationCode, actorId } = await req.json();
  if (!deliveryId || !status) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const delivery = await db.delivery.findUnique({ where: { id: deliveryId }, include: { order: { include: { patient: true } } } });
  if (!delivery) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
  if (!canTransitionDelivery(delivery.status, status)) {
    return NextResponse.json({ error: `Cannot transition delivery from ${delivery.status} to ${status}.` }, { status: 400 });
  }
  // Delivery confirmation requires the verification code.
  if (status === "delivered" && verificationCode !== delivery.verificationCode) {
    return NextResponse.json({ error: "Incorrect delivery verification code." }, { status: 400 });
  }
  const updated = await db.delivery.update({ where: { id: deliveryId }, data: { status }, include: { order: true } });
  if (status === "delivered" && delivery.orderId) {
    await db.pharmacyOrder.update({ where: { id: delivery.orderId }, data: { status: "delivered" } });
    await notify({
      recipientId: delivery.order?.patientId ?? "",
      recipientType: "patient",
      title: "Medicine delivered",
      body: `Your order ${delivery.order?.orderNumber} has been delivered.`,
      type: "pharmacy",
      relatedId: delivery.orderId,
    });
  }
  await audit({
    actorId: actorId ?? delivery.logisticsProviderId,
    actorRole: "logistics",
    action: "delivery_status_changed",
    entityType: "delivery",
    entityId: deliveryId,
    description: `Delivery ${delivery.deliveryNumber} → ${status}.`,
  });
  return NextResponse.json({ data: updated });
}
