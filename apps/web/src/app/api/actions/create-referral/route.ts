// POST /api/actions/create-referral
// Doctor creates a referral + care handoff. Notifies the recipient provider
// (if specified) and records an access grant.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    encounterId,
    patientId,
    senderProviderId,
    recipientProviderId,
    recipientSpecialty,
    reason,
    symptoms,
    relevantHistory,
    diagnosis,
    currentTreatment,
    requiredAction,
    urgency,
    attachments,
    accessExpiry,
    actorId,
  } = body ?? {};

  if (!patientId || !senderProviderId || !reason) {
    return NextResponse.json({ error: "Missing required referral fields." }, { status: 400 });
  }
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const refId = genId("REF");
  const referral = await db.referral.create({
    data: {
      id: refId,
      referralNumber: genId("RPH-REF"),
      encounterId: encounterId ?? null,
      patientId,
      senderProviderId,
      recipientProviderId: recipientProviderId ?? null,
      recipientSpecialty: recipientSpecialty ?? null,
      reason,
      symptoms: symptoms ?? null,
      relevantHistory: relevantHistory ?? null,
      diagnosis: diagnosis ?? null,
      currentTreatment: currentTreatment ?? null,
      requiredAction: requiredAction ?? null,
      urgency: urgency ?? "routine",
      attachments: JSON.stringify(attachments ?? []),
      accessExpiry: accessExpiry ?? null,
      status: "sent",
    },
    include: { patient: true, sender: true, recipient: true },
  });

  // Care handoff = record access grant to the recipient.
  if (recipientProviderId) {
    const recipient = await db.provider.findUnique({ where: { id: recipientProviderId } });
    if (recipient) {
      await db.recordAccessGrant.create({
        data: {
          id: genId("RAG"),
          patientId,
          granteeType: "provider",
          granteeId: recipientProviderId,
          granteeName: `${recipient.title} ${recipient.firstName} ${recipient.lastName}`,
          organisation: "Royal Palace Health Care",
          reason: `Referral: ${reason}`,
          informationShared: JSON.stringify(["Consultations", "Diagnoses", "Laboratory Results", "Prescriptions"]),
          grantedAt: new Date(),
          expiresAt: accessExpiry ?? null,
          relatedReferralId: refId,
          status: "active",
        },
      });
      await notify({
        recipientId: recipientProviderId,
        recipientType: "provider",
        title: "New referral received",
        body: `Referral from ${referral.sender?.title} ${referral.sender?.lastName} for ${patient.firstName} ${patient.lastName}.`,
        type: "system",
        relatedId: refId,
      });
    }
  }

  await audit({
    actorId: actorId ?? senderProviderId,
    actorRole: "doctor",
    action: "doctor_created_referral",
    entityType: "referral",
    entityId: refId,
    description: `Referral ${referral.referralNumber} created for ${patient.firstName} ${patient.lastName}.`,
  });

  return NextResponse.json({ data: referral }, { status: 201 });
}
