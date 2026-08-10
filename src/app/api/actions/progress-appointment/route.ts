// POST /api/actions/progress-appointment
// Validates status transitions for appointments (see spec section 75) and
// persists the new status. Emits audit + notifications.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { canTransitionAppointment } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { appointmentId, status, actorId, actorRole } = await req.json();
  if (!appointmentId || !status) {
    return NextResponse.json({ error: "Missing appointmentId or status." }, { status: 400 });
  }
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, provider: true },
  });
  if (!appt) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  if (!canTransitionAppointment(appt.status, status)) {
    return NextResponse.json(
      { error: `Cannot transition appointment from ${appt.status} to ${status}.` },
      { status: 400 }
    );
  }
  const updated = await db.appointment.update({
    where: { id: appointmentId },
    data: { status },
    include: { patient: true, provider: true },
  });
  await audit({
    actorId: actorId ?? appt.providerId,
    actorRole: actorRole ?? "doctor",
    action: "appointment_status_changed",
    entityType: "appointment",
    entityId: appointmentId,
    description: `Appointment ${appt.id} moved from ${appt.status} → ${status}.`,
  });
  if (status === "in_progress" || status === "completed") {
    await notify({
      recipientId: appt.patientId,
      recipientType: "patient",
      title: status === "completed" ? "Consultation completed" : "Consultation started",
      body: status === "completed"
        ? `Your consultation with ${appt.provider?.title} ${appt.provider?.lastName} is complete.`
        : `Your consultation with ${appt.provider?.title} ${appt.provider?.lastName} has started.`,
      type: "appointment",
      relatedId: appointmentId,
    });
  }
  return NextResponse.json({ data: updated });
}
