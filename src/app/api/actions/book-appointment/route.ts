// POST /api/actions/book-appointment
// Validates provider verification, creates the appointment + payment, and
// emits audit + notifications.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { genId } from "@/lib/format";
import { consultationChannelLabel, isOnlineConsultationChannel } from "@/lib/consultation-policy";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    patientId,
    providerId,
    serviceId,
    servicePriceId,
    date,
    time,
    consultationChannel,
    intakeForm,
    price,
  } = body ?? {};

  if (!patientId || !providerId || !date || !time) {
    return NextResponse.json({ error: "Missing required booking fields." }, { status: 400 });
  }

  const channel = consultationChannel ?? "video";
  if (!isOnlineConsultationChannel(channel)) {
    return NextResponse.json(
      { error: "Only video, voice, and chat consultations are supported." },
      { status: 400 }
    );
  }

  const provider = await db.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  if (provider.verificationStatus !== "approved") {
    return NextResponse.json({ error: "Only verified providers can be booked." }, { status: 400 });
  }

  let providerModes: string[] = [];
  try {
    const parsedModes: unknown = JSON.parse(provider.consultationModes);
    providerModes = Array.isArray(parsedModes) ? parsedModes.filter((mode): mode is string => typeof mode === "string") : [];
  } catch {
    return NextResponse.json({ error: "Provider consultation modes are unavailable." }, { status: 400 });
  }
  if (!providerModes.includes(channel)) {
    return NextResponse.json({ error: "This specialist does not support the selected online consultation mode." }, { status: 400 });
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const apptId = genId("APT");
  const appointment = await db.appointment.create({
    data: {
      id: apptId,
      patientId,
      providerId,
      serviceId: serviceId ?? null,
      servicePriceId: servicePriceId ?? null,
      date,
      time,
      durationMinutes: 30,
      consultationChannel: channel,
      price: Number(price ?? provider.consultationFee),
      paymentStatus: "paid",
      status: "scheduled",
      intakeForm: JSON.stringify(intakeForm ?? {}),
      consentStatus: "granted",
    },
    include: { patient: true, provider: true },
  });

  const payment = await db.payment.create({
    data: {
      id: genId("PAY"),
      paymentNumber: genId("RPH-PAY"),
      appointmentId: apptId,
      patientId,
      amount: Number(price ?? provider.consultationFee),
      method: body.method ?? "card",
      status: "successful",
      reference: genId("DEMO-PAY"),
    },
  });

  await audit({
    actorId: patientId,
    actorRole: "patient",
    action: "patient_booked_consultation",
    entityType: "appointment",
    entityId: apptId,
    description: `${patient.firstName} ${patient.lastName} booked a consultation with ${provider.title} ${provider.firstName} ${provider.lastName}.`,
  });
  await notify({
    recipientId: patientId,
    recipientType: "patient",
    title: "Appointment confirmed",
    body: `Your ${consultationChannelLabel(channel).toLowerCase()} consultation with ${provider.title} ${provider.lastName} is confirmed for ${date} at ${time}.`,
    type: "appointment",
    relatedId: apptId,
  });
  await notify({
    recipientId: providerId,
    recipientType: "provider",
    title: "New appointment",
    body: `${patient.firstName} ${patient.lastName} booked a consultation.`,
    type: "appointment",
    relatedId: apptId,
  });

  return NextResponse.json({ data: { ...appointment, payment } }, { status: 201 });
}
