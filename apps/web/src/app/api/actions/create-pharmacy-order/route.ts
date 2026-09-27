// POST /api/actions/create-pharmacy-order
// Patient sends a prescription to a pharmacy. Builds order items from the
// selected pharmacy products (matching prescription items where possible),
// calculates item-level commission, persists the order, and auto-creates a
// delivery assignment for logistics.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";
import { recordPatientActivityPayment } from "@/lib/manager-patient-earnings";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prescriptionId, patientId, pharmacyId, items, deliveryAddress, deliveryFee, actorId } = body ?? {};
  if (!patientId || !pharmacyId || !items?.length) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  const pharmacy = await db.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  // Build order items with commission calculation per item.
  const orderItems = items.map((it: { productId: string; quantity: number }) => {
    const product = items.find((i: { productId: string }) => i.productId === it.productId);
    const unitPrice = Number(product?.unitPrice ?? 0);
    const quantity = Number(it.quantity);
    const gross = unitPrice * quantity;
    const commissionPct = pharmacy.commissionPct;
    const commissionAmount = Math.round((gross * commissionPct) / 100);
    const pharmacyNet = gross - commissionAmount;
    return {
      id: genId("ORDI"),
      productId: it.productId,
      productName: product?.productName ?? "Medicine",
      quantity,
      unitPrice,
      gross,
      commissionPct,
      commissionAmount,
      pharmacyNet,
    };
  });

  const subtotal = orderItems.reduce((s: number, i: { gross: number }) => s + i.gross, 0);
  const commissionTotal = orderItems.reduce((s: number, i: { commissionAmount: number }) => s + i.commissionAmount, 0);
  const total = subtotal + Number(deliveryFee ?? 1500);
  const verificationCode = `RP-${Math.floor(1000 + Math.random() * 9000)}`;

  const orderId = genId("ORD");
  const order = await db.pharmacyOrder.create({
    data: {
      id: orderId,
      orderNumber: genId("RPH-ORD"),
      prescriptionId: prescriptionId ?? null,
      patientId,
      pharmacyId,
      deliveryAddress: deliveryAddress ?? null,
      deliveryFee: Number(deliveryFee ?? 1500),
      subtotal,
      commissionTotal,
      total,
      paymentStatus: "paid",
      status: prescriptionId ? "prescription_under_review" : "accepted",
      verificationCode,
      items: { create: orderItems },
    },
    include: { items: true, pharmacy: true, patient: true, prescription: true },
  });

  // Auto-create a delivery assignment (logistics queue) when order is accepted.
  if (order.status === "accepted" && deliveryAddress) {
    await db.delivery.create({
      data: {
        id: genId("DEL"),
        deliveryNumber: genId("RPH-DEL"),
        orderId: order.id,
        logisticsProviderId: "LOG-001",
        packageType: "pharmacy",
        pickupLocation: `${pharmacy.name}, ${pharmacy.city}`,
        pickupContact: pharmacy.phone,
        deliveryLocation: deliveryAddress,
        recipientName: `${patient.firstName} ${patient.lastName}`,
        handlingInstruction: "Handle with care, keep dry.",
        verificationCode,
        payout: Number(deliveryFee ?? 1500),
        status: "assigned",
      },
    });
  }

  // Mark prescription as awaiting/processing.
  if (prescriptionId) {
    await db.prescription.update({ where: { id: prescriptionId }, data: { status: "awaiting_pharmacy" } });
  }

  await db.$transaction((tx) => recordPatientActivityPayment({
    patientId, activityType: "pharmacy", sourceId: order.id,
    amount: total, reference: `pharmacy-order:${order.id}`,
  }, tx));

  await audit({
    actorId: actorId ?? patientId,
    actorRole: "patient",
    action: "patient_created_pharmacy_order",
    entityType: "pharmacy_order",
    entityId: orderId,
    description: `Pharmacy order ${order.orderNumber} created for ${patient.firstName} ${patient.lastName}.`,
  });
  await notify({
    recipientId: pharmacyId,
    recipientType: "pharmacy",
    title: "New order received",
    body: `A new paid order ${order.orderNumber} has been received.`,
    type: "pharmacy",
    relatedId: orderId,
  });
  await notify({
    recipientId: patientId,
    recipientType: "patient",
    title: "Order placed",
    body: `Your order ${order.orderNumber} has been placed. We will keep you updated.`,
    type: "pharmacy",
    relatedId: orderId,
  });

  return NextResponse.json({ data: order }, { status: 201 });
}
