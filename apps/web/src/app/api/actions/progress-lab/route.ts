// POST /api/actions/progress-lab
// Validates & persists lab workflow status transitions (see spec section 38).
// When status becomes "completed", also completes the linked request and
// notifies the patient + referring doctor.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { canTransitionLab } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { bookingId, status, actorId } = await req.json();
  if (!bookingId || !status) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const booking = await db.laboratoryBooking.findUnique({
    where: { id: bookingId },
    include: { request: { include: { patient: true, provider: true } }, laboratory: true },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!canTransitionLab(booking.status, status)) {
    return NextResponse.json({ error: `Cannot transition lab booking from ${booking.status} to ${status}.` }, { status: 400 });
  }
  const updated = await db.laboratoryBooking.update({ where: { id: bookingId }, data: { status }, include: { laboratory: true, request: true } });
  await audit({
    actorId: actorId ?? booking.laboratoryId,
    actorRole: "laboratory",
    action: "lab_status_changed",
    entityType: "laboratory_booking",
    entityId: bookingId,
    description: `Lab booking ${booking.bookingNumber} → ${status}.`,
  });
  return NextResponse.json({ data: updated });
}
