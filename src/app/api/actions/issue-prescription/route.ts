// POST /api/actions/issue-prescription
// Creates prescription + items linked to an encounter, patient and provider,
// and notifies the patient.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const {
    encounterId,
    patientId,
    providerId,
    notes,
    doctorNote,
    pharmacyId,
    validityStartDate,
    expiryDate,
    items,
    actorId,
  } = await req.json();

  if (!patientId || !providerId || !items?.length) {
    return NextResponse.json({ error: "Missing patient, provider or items." }, { status: 400 });
  }
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const rxId = genId("RX");
  const prescription = await db.prescription.create({
    data: {
      id: rxId,
      prescriptionNumber: genId("RPH-RX"),
      encounterId: encounterId ?? null,
      patientId,
      providerId,
      status: "issued",
      validityStartDate: validityStartDate ?? new Date().toISOString().slice(0, 10),
      expiryDate: expiryDate ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      notes: notes ?? null,
      doctorNote: doctorNote ?? null,
      pharmacyId: pharmacyId ?? null,
      items: { create: items },
    },
    include: { items: true, patient: true, provider: true, pharmacy: true },
  });

  await audit({
    actorId: actorId ?? providerId,
    actorRole: "doctor",
    action: "doctor_issued_prescription",
    entityType: "prescription",
    entityId: rxId,
    description: `Prescription ${prescription.prescriptionNumber} issued for ${patient.firstName} ${patient.lastName}.`,
  });
  await notify({
    recipientId: patientId,
    recipientType: "patient",
    title: "New prescription",
    body: `A new prescription (${prescription.prescriptionNumber}) has been issued. You can now order your medicines.`,
    type: "prescription",
    relatedId: rxId,
  });

  return NextResponse.json({ data: prescription }, { status: 201 });
}
