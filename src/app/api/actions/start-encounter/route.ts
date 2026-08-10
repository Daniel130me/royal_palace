// POST /api/actions/start-encounter
// Creates a ClinicalEncounter for an appointment (status open, unlocked),
// links it back to the appointment, and moves the appointment to in_progress.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { genId } from "@/lib/format";
import { canTransitionAppointment } from "@/lib/format";

export async function POST(req: NextRequest) {
  const { appointmentId, actorId } = await req.json();
  if (!appointmentId) return NextResponse.json({ error: "Missing appointmentId." }, { status: 400 });
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, provider: true, encounter: true },
  });
  if (!appt) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  if (appt.encounter) {
    return NextResponse.json({ data: appt.encounter });
  }
  const encounter = await db.clinicalEncounter.create({
    data: {
      id: genId("ENC"),
      encounterNumber: genId("RPH-ENC"),
      appointmentId: appt.id,
      patientId: appt.patientId,
      providerId: appt.providerId,
      status: "open",
      locked: false,
      documentation: JSON.stringify({}),
    },
  });
  if (canTransitionAppointment(appt.status, "in_progress")) {
    await db.appointment.update({ where: { id: appt.id }, data: { status: "in_progress" } });
  }
  await audit({
    actorId: actorId ?? appt.providerId,
    actorRole: "doctor",
    action: "encounter_started",
    entityType: "encounter",
    entityId: encounter.id,
    description: `Clinical encounter started for ${appt.patient?.firstName} ${appt.patient?.lastName}.`,
  });
  return NextResponse.json({ data: encounter }, { status: 201 });
}
