// POST /api/actions/admin-review-manager-application
// Admin reviews a manager's organization application (plan §3.4).
// On APPROVE everything happens in ONE transaction: organization + user
// rows, acquired-by attribution, the first assignment-history record,
// audit and notifications — so an application can never half-onboard.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";

const REVIEW_ACTIONS = ["under_review", "information_required", "approved", "rejected"] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const body = await req.json();
    const { applicationId, action, reviewerNote } = body ?? {};

    if (!REVIEW_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `action must be one of ${REVIEW_ACTIONS.join(", ")}.` }, { status: 400 });
    }
    if ((action === "rejected" || action === "information_required") && !reviewerNote?.trim()) {
      return NextResponse.json({ error: "A reviewer note is required for this decision." }, { status: 400 });
    }

    const application = await db.managerOrganizationApplication.findUnique({ where: { id: applicationId } });
    if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

    const result = await db.$transaction(async (tx) => {
      const data = {
        status: action,
        reviewedAt: new Date(),
        reviewerId: admin.profileId ?? admin.userId,
        reviewerNote: reviewerNote?.trim() || null,
      };

      if (action !== "approved") {
        const updated = await tx.managerOrganizationApplication.update({ where: { id: application.id }, data });
        return { application: updated };
      }

      // APPROVAL creates the organization and permanent acquisition
      // attribution. It deliberately does NOT assign the organization to the
      // Manager: Managers are marketers, not account owners.
      const orgId = application.organizationType === "pharmacy"
        ? genId("PHA")
        : application.organizationType === "laboratory" ? genId("LAB") : genId("HOS");
      const userId = genId("USR");
      const now = new Date();

      await tx.user.create({
        data: {
          id: userId,
          email: application.contactEmail,
          password: "demo123", // prototype only — production must hash credentials
          role: application.organizationType,
          status: "active",
          profileId: orgId,
          name: application.businessName,
        },
      });

      if (application.organizationType === "pharmacy") {
        await tx.pharmacy.create({
          data: {
            id: orgId,
            userId,
            pharmacyNumber: `RPH-${orgId}`,
            name: application.businessName,
            city: application.city,
            state: application.state,
            address: application.address,
            phone: application.contactPhone,
            email: application.contactEmail,
            verificationStatus: "approved",
            acquiredByManagerId: application.managerId, // acquisition attribution is permanent
            acquiredAt: now,
          },
        });
      } else if (application.organizationType === "laboratory") {
        await tx.laboratory.create({
          data: {
            id: orgId,
            userId,
            laboratoryNumber: `RPH-${orgId}`,
            name: application.businessName,
            city: application.city,
            state: application.state,
            address: application.address,
            phone: application.contactPhone,
            email: application.contactEmail,
            verificationStatus: "approved",
            acquiredByManagerId: application.managerId,
            acquiredAt: now,
          },
        });
      } else {
        const serviceNames: string[] = JSON.parse(application.services || "[]");
        await tx.hospital.create({
          data: {
            id: orgId, userId, hospitalNumber: `RPH-${orgId}`, name: application.businessName,
            description: application.notes, city: application.city, state: application.state,
            address: application.address, phone: application.contactPhone, email: application.contactEmail,
            verificationStatus: "approved", acquiredByManagerId: application.managerId, acquiredAt: now,
            services: {
              create: serviceNames.map((name, index) => ({
                id: genId("HOS-SVC"), name, category: index === 0 ? "Primary service" : "Clinical service",
              })),
            },
          },
        });
      }

      const updated = await tx.managerOrganizationApplication.update({
        where: { id: application.id },
        data: {
          ...data,
          createdPharmacyId: application.organizationType === "pharmacy" ? orgId : null,
          createdLaboratoryId: application.organizationType === "laboratory" ? orgId : null,
          createdHospitalId: application.organizationType === "hospital" ? orgId : null,
        },
      });
      return { application: updated, orgId };
    });

    // Post-commit notifications (non-critical, best effort).
    await db.notification.create({
      data: {
        id: genId("NTF"),
        recipientId: application.managerId,
        recipientType: "manager",
        title: `Application ${action.replace("_", " ")}`,
        body: `${application.applicationNumber} was ${action.replace("_", " ")}.${reviewerNote ? ` Note: ${reviewerNote}` : ""}`,
        type: "manager",
        relatedId: application.id,
        read: false,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin-review-manager-application]", error);
    return NextResponse.json({ error: "Failed to review application." }, { status: 500 });
  }
}
