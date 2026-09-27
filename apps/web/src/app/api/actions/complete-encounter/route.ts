// PATCH /api/actions/complete-encounter
// Validates required documentation fields, locks & signs the encounter,
// moves the appointment to completed, and emits audit + notifications.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";

const REQUIRED_FIELDS = [
  "consultationReason",
  "relevantMedicalHistory",
  "allergyConfirmation",
  "medicationHistory",
  "assessment",
  "diagnosis",
  "treatmentPlan",
  "followUp",
] as const;

export async function PATCH(req: NextRequest) {
  const { encounterId, documentation, actorId } = await req.json();
  if (!encounterId) return NextResponse.json({ error: "Missing encounterId." }, { status: 400 });
  const enc = await db.clinicalEncounter.findUnique({
    where: { id: encounterId },
    include: { appointment: { include: { patient: true, provider: true } }, patient: true },
  });
  if (!enc) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });
  if (enc.locked) return NextResponse.json({ error: "Encounter is already signed and locked." }, { status: 400 });

  const doc = documentation ?? {};
  const missing = REQUIRED_FIELDS.filter((f) => !doc[f] || String(doc[f]).trim() === "");
  if (missing.length) {
    return NextResponse.json(
      { error: `Cannot complete encounter. Missing required fields: ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const updated = await db.clinicalEncounter.update({
    where: { id: encounterId },
    data: {
      documentation: JSON.stringify(doc),
      status: "completed",
      locked: true,
      signedAt: new Date(),
    },
    include: { appointment: { include: { patient: true, provider: true } } },
  });

  // Move the linked appointment to completed if possible.
  const appt = enc.appointment;
  if (appt && appt.status !== "completed") {
    await db.appointment.update({ where: { id: appt.id }, data: { status: "awaiting_documentation" } });
    await db.appointment.update({ where: { id: appt.id }, data: { status: "completed" } });
  }

  // Persist the primary diagnosis as a Diagnosis record.
  if (doc.diagnosis) {
    await db.diagnosis.create({
      data: {
        id: `DX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        encounterId,
        patientId: enc.patientId,
        code: doc.diagnosisCode ?? null,
        description: String(doc.diagnosis),
        type: "primary",
        status: "active",
      },
    });
  }

  await audit({
    actorId: actorId ?? enc.providerId,
    actorRole: "doctor",
    action: "doctor_completed_consultation",
    entityType: "encounter",
    entityId: encounterId,
    description: `Encounter ${enc.encounterNumber} completed and signed for ${enc.patient?.firstName} ${enc.patient?.lastName}.`,
  });
  await notify({
    recipientId: enc.patientId,
    recipientType: "patient",
    title: "Consultation summary available",
    body: `Your consultation with ${appt?.provider?.title} ${appt?.provider?.lastName} has been documented.`,
    type: "system",
    relatedId: encounterId,
  });

  return NextResponse.json({ data: updated });
}
