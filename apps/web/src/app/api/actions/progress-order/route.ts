// POST /api/actions/progress-order
// Validates pharmacy order status transitions and persists them.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { canTransitionOrder } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { orderId, status, actorId } = await req.json();
  if (!orderId || !status) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const order = await db.pharmacyOrder.findUnique({ where: { id: orderId }, include: { patient: true, pharmacy: true } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!canTransitionOrder(order.status, status)) {
    return NextResponse.json({ error: `Cannot transition order from ${order.status} to ${status}.` }, { status: 400 });
  }
  const updated = await db.pharmacyOrder.update({
    where: { id: orderId },
    data: { status },
    include: { items: true, pharmacy: true, patient: true, prescription: true },
  });
  await audit({
    actorId: actorId ?? order.pharmacyId,
    actorRole: "pharmacy",
    action: "order_status_changed",
    entityType: "pharmacy_order",
    entityId: orderId,
    description: `Pharmacy order ${order.orderNumber} → ${status}.`,
  });
  await notify({
    recipientId: order.patientId,
    recipientType: "patient",
    title: "Order update",
    body: `Your order ${order.orderNumber} is now ${status.replace(/_/g, " ")}.`,
    type: "pharmacy",
    relatedId: orderId,
  });
  return NextResponse.json({ data: updated });
}
