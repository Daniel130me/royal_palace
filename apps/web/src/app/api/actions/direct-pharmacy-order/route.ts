// POST /api/actions/direct-pharmacy-order
// A registered patient orders uncontrolled (non-sensitive) medication
// directly from a pharmacy WITHOUT a doctor's prescription. Controlled meds
// are rejected — they require an issued prescription first.
//
// The order is created with status "accepted" (no prescription review needed)
// and a delivery assignment is auto-created for logistics.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";
import { recordPatientActivityPayment } from "@/lib/manager-patient-earnings";

interface DirectOrderItem {
  productId: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { patientId, pharmacyId, items, deliveryAddress, deliveryFee, uploadedPrescriptionId, actorId } = body ?? {};

  if (!patientId || !pharmacyId || !items?.length || !deliveryAddress) {
    return NextResponse.json({ error: "Patient, pharmacy, items and delivery address are required." }, { status: 400 });
  }

  const pharmacy = await db.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  // Resolve products and ENFORCE the controlled-medication restriction.
  const orderItems: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    gross: number;
    commissionPct: number;
    commissionAmount: number;
    pharmacyNet: number;
  }[] = [];

  for (const it of items as DirectOrderItem[]) {
    const product = await db.pharmacyProduct.findUnique({ where: { id: it.productId } });
    if (!product) {
      return NextResponse.json({ error: `Product ${it.productId} not found.` }, { status: 404 });
    }
    if (product.pharmacyId !== pharmacyId) {
      return NextResponse.json({ error: `${product.name} is not stocked by this pharmacy.` }, { status: 400 });
    }
    // CONTROLLED MEDS CANNOT BE ORDERED DIRECTLY.
    if (product.controlled) {
      return NextResponse.json(
        { error: `${product.name} is a controlled medication and requires a doctor's prescription before it can be ordered. Please consult a doctor or upload a valid prescription.` },
        { status: 400 }
      );
    }
    if (product.status !== "active") {
      return NextResponse.json({ error: `${product.name} is currently unavailable.` }, { status: 400 });
    }
    const quantity = Number(it.quantity);
    const unitPrice = product.price;
    const gross = unitPrice * quantity;
    const commissionPct = pharmacy.commissionPct;
    const commissionAmount = Math.round((gross * commissionPct) / 100);
    const pharmacyNet = gross - commissionAmount;
    orderItems.push({
      id: genId("ORDI"),
      productId: product.id,
      productName: `${product.name} ${product.strength} ${product.dosageForm}`,
      quantity,
      unitPrice,
      gross,
      commissionPct,
      commissionAmount,
      pharmacyNet,
    });
  }

  const subtotal = orderItems.reduce((s, i) => s + i.gross, 0);
  const commissionTotal = orderItems.reduce((s, i) => s + i.commissionAmount, 0);
  const fee = Number(deliveryFee ?? 1500);
  const total = subtotal + fee;
  const verificationCode = `RP-${Math.floor(1000 + Math.random() * 9000)}`;

  const orderId = genId("ORD");
  const order = await db.pharmacyOrder.create({
    data: {
      id: orderId,
      orderNumber: genId("RPH-ORD"),
      // No prescriptionId — this is a direct OTC order. (uploadedPrescriptionId
      // is tracked separately via the UploadedPrescription record if provided.)
      patientId,
      pharmacyId,
      deliveryAddress,
      deliveryFee: fee,
      subtotal,
      commissionTotal,
      total,
      paymentStatus: "paid",
      status: "accepted", // no prescription review needed for OTC
      verificationCode,
      items: { create: orderItems },
    },
    include: { items: true, pharmacy: true, patient: true },
  });

  await db.$transaction((tx) => recordPatientActivityPayment({
    patientId, activityType: "pharmacy", sourceId: order.id,
    amount: total, reference: `direct-pharmacy-order:${order.id}`,
  }, tx));

  // Auto-create delivery assignment.
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
      handlingInstruction: "OTC order — handle with care.",
      verificationCode,
      payout: fee,
      status: "assigned",
    },
  });

  // Link the uploaded prescription (if any) to this order via audit trail.
  if (uploadedPrescriptionId) {
    await audit({
      actorId: patientId,
      actorRole: "patient",
      action: "patient_attached_uploaded_prescription",
      entityType: "pharmacy_order",
      entityId: order.id,
      description: `Uploaded prescription ${uploadedPrescriptionId} attached to order ${order.orderNumber}.`,
    });
  }

  await audit({
    actorId: actorId ?? patientId,
    actorRole: "patient",
    action: "patient_direct_pharmacy_order",
    entityType: "pharmacy_order",
    entityId: orderId,
    description: `${patient.firstName} ${patient.lastName} placed a direct OTC order (${order.orderNumber}).`,
  });
  await notify({
    recipientId: pharmacyId,
    recipientType: "pharmacy",
    title: "New direct order",
    body: `A new paid OTC order ${order.orderNumber} has been received.`,
    type: "pharmacy",
    relatedId: orderId,
  });
  await notify({
    recipientId: patientId,
    recipientType: "patient",
    title: "Order placed",
    body: `Your order ${order.orderNumber} has been placed and is being prepared.`,
    type: "pharmacy",
    relatedId: orderId,
  });

  return NextResponse.json({ data: order }, { status: 201 });
}
