// POST /api/actions/publish-lab-result
// Laboratory publishes a result. Completes the lab request, notifies patient
// + referring doctor so the result appears in the clinical timeline.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    requestId,
    bookingId,
    laboratoryId,
    test,
    sampleCollectionDate,
    resultDate,
    value,
    unit,
    referenceRange,
    abnormalIndicator,
    interpretation,
    reviewer,
    actorId,
  } = body ?? {};

  if (!requestId || !laboratoryId || !test || !value) {
    return NextResponse.json({ error: "Missing required result fields." }, { status: 400 });
  }
  const reqRow = await db.laboratoryRequest.findUnique({ where: { id: requestId }, include: { patient: true, provider: true, booking: true } });
  if (!reqRow) return NextResponse.json({ error: "Laboratory request not found." }, { status: 404 });

  const result = await db.laboratoryResult.create({
    data: {
      id: genId("LABRES"),
      resultNumber: genId("RPH-LABRES"),
      requestId,
      bookingId: bookingId ?? reqRow.booking?.id ?? null,
      patientId: reqRow.patientId,
      laboratoryId,
      test,
      sampleCollectionDate,
      resultDate,
      value,
      unit: unit ?? null,
      referenceRange: referenceRange ?? null,
      abnormalIndicator: abnormalIndicator ?? "normal",
      interpretation: interpretation ?? null,
      reviewer: reviewer ?? null,
      status: "published",
    },
    include: { laboratory: true },
  });
  await db.laboratoryRequest.update({ where: { id: requestId }, data: { status: "completed" } });
  if (reqRow.booking) {
    await db.laboratoryBooking.update({ where: { id: reqRow.booking.id }, data: { status: "result_published" } });
  }

  await audit({
    actorId: actorId ?? laboratoryId,
    actorRole: "laboratory",
    action: "laboratory_published_result",
    entityType: "laboratory_result",
    entityId: result.id,
    description: `Laboratory result ${result.resultNumber} published for ${reqRow.patient?.firstName} ${reqRow.patient?.lastName}.`,
  });
  await notify({
    recipientId: reqRow.patientId,
    recipientType: "patient",
    title: "Laboratory result available",
    body: `Your ${test} result is now available in Health Records.`,
    type: "laboratory",
    relatedId: result.id,
  });
  if (reqRow.requestingProviderId) {
    await notify({
      recipientId: reqRow.requestingProviderId,
      recipientType: "provider",
      title: "New laboratory result",
      body: `A laboratory result for ${reqRow.patient?.firstName} ${reqRow.patient?.lastName} is ready for review.`,
      type: "laboratory",
      relatedId: result.id,
    });
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
