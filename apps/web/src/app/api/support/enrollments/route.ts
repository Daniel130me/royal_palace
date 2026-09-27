import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSupportOrAdminContext, ManagerAccessError } from "@/lib/manager-access";

/** Full operational enrollment records for authorized Support/Admin staff. */
export async function GET(req: Request) {
  try {
    await getSupportOrAdminContext(req);
    const [patients, pharmacies, laboratories, hospitals] = await Promise.all([
      db.patient.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, patientNumber: true, firstName: true, lastName: true, email: true, phone: true, city: true, state: true, onboardingStatus: true, acquiredByManagerId: true, createdAt: true } }),
      db.pharmacy.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, pharmacyNumber: true, name: true, email: true, phone: true, city: true, state: true, verificationStatus: true, acquiredByManagerId: true, createdAt: true } }),
      db.laboratory.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, laboratoryNumber: true, name: true, email: true, phone: true, city: true, state: true, verificationStatus: true, acquiredByManagerId: true, createdAt: true } }),
      db.hospital.findMany({ orderBy: { createdAt: "desc" }, include: { services: { where: { active: true }, select: { name: true, category: true } } } }),
    ]);
    return NextResponse.json({ data: { patients, pharmacies, laboratories, hospitals } });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[support/enrollments]", error);
    return NextResponse.json({ error: "Failed to load enrollments." }, { status: 500 });
  }
}
