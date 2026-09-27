// POST /api/actions/create-lab-request
// Creates a laboratory request linked to an encounter (optional), patient,
// and requesting provider.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    encounterId,
    patientId,
    requestingProviderId,
    tests,
    clinicalIndication,
    priority,
    preparationInstructions,
    fastingRequired,
    sampleType,
    notes,
    actorId,
  } = body ?? {};

  if (!patientId || !requestingProviderId || !tests?.length) {
    return NextResponse.json({ error: "Missing patient, provider or tests." }, { status: 400 });
  }
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const reqId = genId("LABREQ");
  const request = await db.laboratoryRequest.create({
    data: {
      id: reqId,
      requestNumber: genId("RPH-LABREQ"),
      encounterId: encounterId ?? null,
      patientId,
      requestingProviderId,
      tests: JSON.stringify(tests),
      clinicalIndication: clinicalIndication ?? null,
      priority: priority ?? "routine",
      preparationInstructions: preparationInstructions ?? null,
      fastingRequired: Boolean(fastingRequired),
      sampleType: sampleType ?? null,
      notes: notes ?? null,
      status: "pending_booking",
    },
    include: { patient: true, provider: true },
  });

  await audit({
    actorId: actorId ?? requestingProviderId,
    actorRole: "doctor",
    action: "doctor_requested_lab",
    entityType: "laboratory_request",
    entityId: reqId,
    description: `Laboratory request ${request.requestNumber} created for ${patient.firstName} ${patient.lastName}.`,
  });
  await notify({
    recipientId: patientId,
    recipientType: "patient",
    title: "Laboratory test requested",
    body: `Your doctor has requested: ${tests.join(", ")}. Book a laboratory to complete it.`,
    type: "laboratory",
    relatedId: reqId,
  });

  return NextResponse.json({ data: request }, { status: 201 });
}
