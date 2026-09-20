// GET /api/manager/me
// Signed-in manager profile + masked payout account + headline stats.
// Powers the Profile, Bank Details and Resources pages without exposing
// anything role-unsafe.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError, maskAccountNumber } from "@/lib/manager-access";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);

    const [bankAccount, acquiredPatients, acquiredPharmacies, acquiredLaboratories, acquiredHospitals, openTicketCount, pendingOrgApplications, pendingPatientApplications] =
      await Promise.all([
        db.managerBankAccount.findUnique({ where: { managerId: manager.id } }),
        db.patient.count({ where: { acquiredByManagerId: manager.id } }),
        db.pharmacy.count({ where: { acquiredByManagerId: manager.id } }),
        db.laboratory.count({ where: { acquiredByManagerId: manager.id } }),
        db.hospital.count({ where: { acquiredByManagerId: manager.id } }),
        db.supportTicket.count({ where: { managerId: manager.id, status: { in: ["new", "assigned_to_manager", "manager_investigating", "waiting_for_organization", "escalated_to_royal_palace", "royal_palace_investigating", "reopened"] } } }),
        db.managerOrganizationApplication.count({ where: { managerId: manager.id, status: { in: ["submitted", "under_review", "information_required"] } } }),
        db.managerPatientApplication.count({ where: { managerId: manager.id, status: { in: ["submitted", "under_review", "information_required"] } } }),
      ]);

    return NextResponse.json({
      data: {
        manager: {
          id: manager.id,
          managerNumber: manager.managerNumber,
          onboardingCode: manager.onboardingCode,
          firstName: manager.firstName,
          lastName: manager.lastName,
          email: manager.email,
          phone: manager.phone,
          city: manager.city,
          state: manager.state,
          territory: manager.territory,
          employmentStatus: manager.employmentStatus,
          verificationStatus: manager.verificationStatus,
          joinedAt: manager.joinedAt,
        },
        bankAccount: bankAccount
          ? {
              id: bankAccount.id,
              bankName: bankAccount.bankName,
              bankCode: bankAccount.bankCode,
              accountName: bankAccount.accountName,
              accountNumberMasked: maskAccountNumber(bankAccount.accountNumber),
              verificationStatus: bankAccount.verificationStatus,
              verifiedAt: bankAccount.verifiedAt,
            }
          : null,
        stats: {
          enrollmentCount: acquiredPatients + acquiredPharmacies + acquiredLaboratories + acquiredHospitals,
          acquiredCount: acquiredPatients + acquiredPharmacies + acquiredLaboratories + acquiredHospitals,
          openTicketCount,
          pendingApplications: pendingOrgApplications + pendingPatientApplications,
        },
      },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/me]", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
