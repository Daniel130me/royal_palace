// POST /api/actions/upload-prescription
// Patient snaps/uploads a copy of a paper prescription received from an
// offline doctor. The uploaded image is stored as a base64 data URL (prototype
// only — production would use object storage). Optionally sends it directly
// to a pharmacy (sets pharmacyId).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    patientId,
    prescriberName,
    prescriberFacility,
    notes,
    fileName,
    fileType,
    fileSize,
    dataUrl,
    pharmacyId,
  } = body ?? {};

  if (!patientId || !dataUrl || !fileName) {
    return NextResponse.json({ error: "Patient, file name and image data are required." }, { status: 400 });
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const upload = await db.uploadedPrescription.create({
    data: {
      id: genId("UPRX"),
      uploadNumber: genId("RPH-UPRX"),
      patientId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      prescriberName: prescriberName ?? null,
      prescriberFacility: prescriberFacility ?? null,
      notes: notes ?? null,
      fileName,
      fileType: fileType ?? "image/jpeg",
      fileSize: fileSize ?? 0,
      dataUrl,
      pharmacyId: pharmacyId ?? null,
      status: pharmacyId ? "under_review" : "uploaded",
    },
  });

  if (pharmacyId) {
    const pharmacy = await db.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (pharmacy) {
      await notify({
        recipientId: pharmacyId,
        recipientType: "pharmacy",
        title: "New uploaded prescription",
        body: `${patient.firstName} ${patient.lastName} uploaded a prescription for review.`,
        type: "prescription",
        relatedId: upload.id,
      });
    }
  }

  await audit({
    actorId: patientId,
    actorRole: "patient",
    action: "patient_uploaded_prescription",
    entityType: "uploaded_prescription",
    entityId: upload.id,
    description: `${patient.firstName} ${patient.lastName} uploaded a doctor-written prescription.`,
  });

  return NextResponse.json({ data: upload }, { status: 201 });
}
