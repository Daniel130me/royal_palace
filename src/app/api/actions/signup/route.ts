// POST /api/actions/signup
// Public self-signup. Anyone can create a patient account and immediately
// order medication from a pharmacy (uncontrolled only) or upload a paper
// prescription. Creates a Patient profile + User record and returns a session.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { genId } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { firstName, lastName, email, phone, password, gender, dateOfBirth, city, state, onboardingCode } = body ?? {};

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: "First name, last name, email and password are required." }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Please sign in." }, { status: 409 });
  }

  const userId = genId("USR");
  const patientId = genId("PAT");
  const patientNumber = `RPH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const manager = onboardingCode
    ? await db.manager.findUnique({ where: { onboardingCode: String(onboardingCode).trim().toUpperCase() } })
    : null;
  if (onboardingCode && (!manager || manager.verificationStatus !== "verified" || manager.employmentStatus === "suspended")) {
    return NextResponse.json({ error: "This onboarding link is invalid or no longer active." }, { status: 400 });
  }

  const { user, patient } = await db.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        id: userId, email: String(email).toLowerCase(), password: String(password),
        phone: phone ?? null, role: "patient", status: manager ? "pending" : "active",
        profileId: patientId, name: `${firstName} ${lastName}`,
      },
    });
    const createdPatient = await tx.patient.create({
      data: {
        id: patientId, userId, patientNumber, firstName, lastName,
        dateOfBirth: dateOfBirth ?? "1990-01-01", gender: gender ?? "Unspecified",
        phone: phone ?? "", email: String(email).toLowerCase(), city: city ?? "Lagos",
        state: state ?? "Lagos", country: "Nigeria", allergies: "[]", conditions: "[]", medications: "[]",
        acquiredByManagerId: manager?.id ?? null, acquiredAt: manager ? new Date() : null,
        onboardingStatus: manager ? "pending" : "approved",
      },
    });
    if (manager) {
      const applicationId = genId("MPA");
      await tx.managerPatientApplication.create({
        data: {
          id: applicationId, applicationNumber: applicationId,
          managerId: manager.id, patientId, status: "submitted",
        },
      });
    }
    return { user: createdUser, patient: createdPatient };
  });

  await audit({
    actorId: patientId,
    actorRole: "patient",
    action: "patient_signed_up",
    entityType: "patient",
    entityId: patientId,
    description: `${firstName} ${lastName} signed up as a patient.`,
  });

  return NextResponse.json({
    session: {
      userId: user.id,
      role: user.role,
      profileId: patientId,
      name: user.name,
      email: user.email,
    },
    patient,
    pendingReview: Boolean(manager),
  }, { status: 201 });
}
