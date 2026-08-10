// POST /api/actions/book-lab
// Patient books a laboratory for a lab request. Creates the booking +
// payment, moves the request to "booked", notifies the lab.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { requestId, laboratoryId, collectionMode, homeAddress, date, time, price, actorId } = body ?? {};
  if (!requestId || !laboratoryId || !date || !time) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  const labReq = await db.laboratoryRequest.findUnique({ where: { id: requestId }, include: { patient: true } });
  if (!labReq) return NextResponse.json({ error: "Laboratory request not found." }, { status: 404 });
  if (labReq.status !== "pending_booking" && labReq.status !== "booked") {
    return NextResponse.json({ error: `Request is already ${labReq.status}.` }, { status: 400 });
  }
  const booking = await db.laboratoryBooking.create({
    data: {
      id: genId("LABBK"),
      bookingNumber: genId("RPH-LABBK"),
      requestId,
      patientId: labReq.patientId,
      laboratoryId,
      collectionMode: collectionMode ?? "facility",
      homeAddress: homeAddress ?? null,
      date,
      time,
      price: Number(price ?? 5000),
      paymentStatus: "paid",
      status: "booked",
    },
    include: { laboratory: true },
  });
  await db.laboratoryRequest.update({ where: { id: requestId }, data: { status: "booked" } });

  await audit({
    actorId: actorId ?? labReq.patientId,
    actorRole: "patient",
    action: "patient_booked_laboratory",
    entityType: "laboratory_booking",
    entityId: booking.id,
    description: `${labReq.patient?.firstName} booked laboratory ${booking.laboratory?.name}.`,
  });
  await notify({
    recipientId: laboratoryId,
    recipientType: "laboratory",
    title: "New laboratory booking",
    body: `New booking ${booking.bookingNumber} received for ${date} at ${time}.`,
    type: "laboratory",
    relatedId: booking.id,
  });

  return NextResponse.json({ data: booking }, { status: 201 });
}
