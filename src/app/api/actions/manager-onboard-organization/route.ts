// POST /api/actions/manager-onboard-organization
// A manager submits a new organization application (plan §3.4).
// Creates a ManagerOrganizationApplication tied to the SESSION-derived
// manager and their onboarding code. Approval (admin action) later creates
// the organization + first assignment in one transaction.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";

export async function POST(req: Request) {
  try {
    const { manager } = await getManagerContext(req);
    const body = await req.json();

    const {
      organizationType,
      businessName,
      contactPerson,
      contactEmail,
      contactPhone,
      address,
      city,
      state,
      registrationNumber,
      licenceNumber,
      notes,
      submit,
    } = body ?? {};

    if (organizationType !== "pharmacy" && organizationType !== "laboratory") {
      return NextResponse.json({ error: "Organization type must be pharmacy or laboratory." }, { status: 400 });
    }
    const required = { businessName, contactPerson, contactEmail, contactPhone, address, city, state, registrationNumber };
    for (const [field, value] of Object.entries(required)) {
      if (!value || typeof value !== "string" || !value.trim()) {
        return NextResponse.json({ error: `Field "${field}" is required.` }, { status: 400 });
      }
    }

    const count = await db.managerOrganizationApplication.count();
    const application = await db.managerOrganizationApplication.create({
      data: {
        id: genId("MOA"),
        applicationNumber: `MOA-${1000 + count + 1}`,
        managerId: manager.id,
        organizationType,
        businessName: businessName.trim(),
        contactPerson: contactPerson.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        contactPhone: contactPhone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        registrationNumber: registrationNumber.trim(),
        licenceNumber: licenceNumber?.trim() || null,
        notes: notes?.trim() || null,
        status: submit === false ? "draft" : "submitted",
        submittedAt: submit === false ? null : new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        id: genId("AUD"),
        actorId: manager.id,
        actorRole: "manager",
        action: "manager_submitted_application",
        entityType: "manager_organization_application",
        entityId: application.id,
        description: `Application ${application.applicationNumber} (${application.businessName}) ${application.status === "draft" ? "saved as draft" : "submitted"}.`,
      },
    });
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: "ADM-001",
        recipientType: "admin",
        title: "New organization application",
        body: `${manager.firstName} ${manager.lastName} submitted ${application.businessName} (${organizationType}).`,
        type: "system",
        relatedId: application.id,
        read: false,
      },
    });

    return NextResponse.json({ data: application }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager-onboard-organization]", error);
    return NextResponse.json({ error: "Failed to submit application." }, { status: 500 });
  }
}
