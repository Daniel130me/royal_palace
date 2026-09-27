// Public organization enrollment reached through a Manager's attributed link.
// Managers cannot submit or edit organization data themselves; Royal Palace
// Admin is the only role allowed to review and decide applications.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";

const ORGANIZATION_TYPES = ["pharmacy", "laboratory", "hospital"] as const;

export async function POST(req: Request) {
  const body = await req.json();
  const {
    onboardingCode, organizationType, businessName, contactPerson, contactEmail,
    contactPhone, address, city, state, registrationNumber, licenceNumber,
    notes, services,
  } = body ?? {};

  if (!ORGANIZATION_TYPES.includes(organizationType)) {
    return NextResponse.json({ error: "Choose pharmacy, laboratory or hospital." }, { status: 400 });
  }
  const manager = await db.manager.findUnique({
    where: { onboardingCode: String(onboardingCode ?? "").trim().toUpperCase() },
    select: { id: true, verificationStatus: true },
  });
  if (!manager || manager.verificationStatus !== "verified") {
    return NextResponse.json({ error: "This onboarding link is invalid or inactive." }, { status: 400 });
  }
  const required = { businessName, contactPerson, contactEmail, contactPhone, address, city, state, registrationNumber };
  for (const [field, value] of Object.entries(required)) {
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: `${field} is required.` }, { status: 400 });
    }
  }
  const serviceNames = Array.isArray(services)
    ? [...new Set(services.map((v) => String(v).trim()).filter(Boolean))].slice(0, 50)
    : [];
  if (organizationType === "hospital" && serviceNames.length === 0) {
    return NextResponse.json({ error: "Hospitals must list at least one service." }, { status: 400 });
  }

  const applicationId = genId("MOA");
  const application = await db.managerOrganizationApplication.create({
    data: {
      id: applicationId, applicationNumber: applicationId,
      managerId: manager.id, organizationType,
      businessName: businessName.trim(), contactPerson: contactPerson.trim(),
      contactEmail: contactEmail.trim().toLowerCase(), contactPhone: contactPhone.trim(),
      address: address.trim(), city: city.trim(), state: state.trim(),
      registrationNumber: registrationNumber.trim(), licenceNumber: licenceNumber?.trim() || null,
      notes: notes?.trim() || null, services: JSON.stringify(serviceNames),
      status: "submitted", submittedAt: new Date(),
    },
  });

  await db.notification.create({
    data: {
      id: genId("NTF"), recipientId: "ADM-001", recipientType: "admin",
      title: "New organization enrollment", body: `${businessName} submitted a ${organizationType} enrollment.`,
      type: "system", relatedId: application.id,
    },
  });
  return NextResponse.json({ data: { applicationNumber: application.applicationNumber, status: application.status } }, { status: 201 });
}
