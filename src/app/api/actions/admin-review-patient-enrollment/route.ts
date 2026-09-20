import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genId } from "@/lib/format";
import { getAdminContext, ManagerAccessError } from "@/lib/manager-access";

const ACTIONS = ["under_review", "information_required", "approved", "rejected"] as const;

export async function POST(req: Request) {
  try {
    const admin = await getAdminContext(req);
    const { applicationId, action, reviewerNote } = await req.json();
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid review action." }, { status: 400 });
    if (["information_required", "rejected"].includes(action) && !reviewerNote?.trim()) return NextResponse.json({ error: "A reviewer note is required." }, { status: 400 });
    const application = await db.managerPatientApplication.findUnique({ where: { id: applicationId } });
    if (!application) return NextResponse.json({ error: "Patient enrollment not found." }, { status: 404 });
    const patient = await db.patient.findUnique({ where: { id: application.patientId } });
    if (!patient) return NextResponse.json({ error: "Patient record not found." }, { status: 404 });
    const onboardingStatus = action === "under_review" ? "pending" : action;
    const userStatus = action === "approved" ? "active" : action === "rejected" ? "suspended" : "pending";
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.managerPatientApplication.update({ where: { id: applicationId }, data: { status: action, reviewedAt: new Date(), reviewerId: admin.profileId ?? admin.userId, reviewerNote: reviewerNote?.trim() || null } });
      await tx.patient.update({ where: { id: patient.id }, data: { onboardingStatus } });
      await tx.user.update({ where: { id: patient.userId }, data: { status: userStatus } });
      await tx.auditLog.create({ data: { id: genId("AUD"), actorId: admin.profileId ?? admin.userId, actorRole: "admin", action: `patient_enrollment_${action}`, entityType: "manager_patient_application", entityId: applicationId, description: `${application.applicationNumber} marked ${action.replace("_", " ")}.` } });
      return updated;
    });
    await db.notification.create({ data: { id: genId("NTF"), recipientId: application.managerId, recipientType: "manager", title: `Enrollment ${action.replace("_", " ")}`, body: `${application.applicationNumber} was ${action.replace("_", " ")}.${reviewerNote ? ` Note: ${reviewerNote}` : ""}`, type: "manager", relatedId: application.id, read: false } });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[admin-review-patient-enrollment]", error);
    return NextResponse.json({ error: "Failed to review patient enrollment." }, { status: 500 });
  }
}
