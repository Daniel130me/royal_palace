import type { ServiceConfig } from "@royal-palace/config/environment";
import { v7 } from "uuid";

import { PrismaPrescriptionRepository } from "../src/pharmacy/infrastructure/prisma-prescription.repository.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { requireDisposableDatabase } from "./database-safety.js";

const REPRESENTATIVE_QUEUE_SIZE = 5_000;

async function main(): Promise<void> {
  const databaseUrl = requireDisposableDatabase().toString();
  const database = new PrismaService({ databaseUrl } as ServiceConfig);
  const repository = new PrismaPrescriptionRepository(database);
  try {
    const fixture = await createFixture(database);
    await expectDatabaseRejection(
      () =>
        database.$executeRawUnsafe(
          `INSERT INTO "prescriptions"
             ("id", "prescription_number", "patient_id", "practitioner_id",
              "jurisdiction_code", "updated_at")
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 'CA-ON', now())`,
          v7(),
          `RX-NO-APPOINTMENT-${v7()}`,
          fixture.patientId,
          fixture.practitionerId,
        ),
      "Prescription without a care-relationship appointment was not rejected",
    );
    const draft = await repository.createDraft({
      actorPrincipalId: fixture.practitionerPrincipalId,
      draft: {
        appointmentId: fixture.appointmentId,
        clinicalNote: "Private synthetic clinical note",
        items: [
          {
            controlledMedication: false,
            dose: "one tablet",
            frequency: "twice daily",
            medicationCode: "SYNTH-001",
            medicationCodeSystem: "https://terminology.synthetic.invalid/medicines",
            medicationName: "Synthetic medicine",
            quantity: "10",
            quantityUnit: "tablet",
            refillsAuthorized: 0,
            substitutionAllowed: false,
          },
        ],
        jurisdictionCode: "CA-ON",
        patientId: fixture.patientId,
      },
      practitionerId: fixture.practitionerId,
    });
    const validUntil = new Date(Date.now() + 86_400_000);
    const signed = await repository.sign({
      actorPrincipalId: fixture.practitionerPrincipalId,
      attestationMethod: "AUTHENTICATED_PLATFORM_ATTESTATION_V1",
      contentDigest: "a".repeat(64),
      expectedVersion: draft.version,
      prescriptionId: draft.id,
      validUntil,
    });
    if (signed?.status !== "SIGNED") throw new Error("Draft was not signed atomically");

    await expectDatabaseRejection(
      () =>
        database.prescriptionItem.update({
          data: { dose: "tampered dose" },
          where: { id: signed.items[0]?.id ?? "" },
        }),
      "Signed prescription item mutation was not rejected",
    );
    await expectDatabaseRejection(
      () =>
        database.prescriptionStatusHistory.update({
          data: { reasonCode: "tampered_history" },
          where: { id: signed.statusHistory[0]?.id ?? "" },
        }),
      "Prescription history mutation was not rejected",
    );

    const routed = await repository.routeToPharmacy({
      actorPrincipalId: fixture.patientPrincipalId,
      expectedVersion: signed.version,
      pharmacyOrganizationId: fixture.pharmacyOrganizationId,
      prescriptionId: signed.id,
    });
    if (
      routed?.status !== "SENT" ||
      routed.pharmacyOrganizationId !== fixture.pharmacyOrganizationId
    ) {
      throw new Error("Patient-directed pharmacy routing was not persisted");
    }
    // Independent clients model separate application requests without issuing
    // concurrent queries through one driver connection.
    const peerDatabase = new PrismaService({ databaseUrl } as ServiceConfig);
    const peerRepository = new PrismaPrescriptionRepository(peerDatabase);
    const acceptance = {
      actorPrincipalId: fixture.pharmacistPrincipalId,
      expectedVersion: routed.version,
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: routed.id,
    };
    const attempts = await Promise.allSettled([
      repository.acceptAtPharmacy(acceptance),
      peerRepository.acceptAtPharmacy(acceptance),
    ]).finally(() => peerDatabase.$disconnect());
    const acceptedCount = attempts.filter(
      (attempt) => attempt.status === "fulfilled" && attempt.value?.status === "ACCEPTED",
    ).length;
    if (acceptedCount !== 1) {
      throw new Error("Concurrent pharmacy acceptance did not produce exactly one transition");
    }

    const expiryDraft = await repository.createDraft({
      actorPrincipalId: fixture.practitionerPrincipalId,
      draft: {
        appointmentId: fixture.appointmentId,
        items: [
          {
            controlledMedication: false,
            dose: "one capsule",
            frequency: "daily",
            medicationName: "Synthetic expiry medicine",
            quantity: "1",
            quantityUnit: "capsule",
            refillsAuthorized: 0,
            substitutionAllowed: false,
          },
        ],
        jurisdictionCode: "DE-BE",
        patientId: fixture.patientId,
      },
      practitionerId: fixture.practitionerId,
    });
    const expiring = await repository.sign({
      actorPrincipalId: fixture.practitionerPrincipalId,
      attestationMethod: "AUTHENTICATED_PLATFORM_ATTESTATION_V1",
      contentDigest: "b".repeat(64),
      expectedVersion: expiryDraft.version,
      prescriptionId: expiryDraft.id,
      validUntil: new Date(Date.now() + 60_000),
    });
    if (expiring === null) throw new Error("Expiry fixture could not be signed");
    const expiry = await repository.expireDue({
      actorPrincipalId: fixture.workerPrincipalId,
      limit: 10,
      now: new Date(Date.now() + 120_000),
    });
    const expired = await repository.findById(expiring.id);
    if (expiry.expired < 1 || expired?.status !== "EXPIRED") {
      throw new Error("Bounded prescription expiry did not persist its terminal history");
    }

    const queuePlan = await verifyPharmacyQueuePlan(database, fixture);

    process.stdout.write(
      `Prescription verification passed: signing immutability, append-only history, patient routing, concurrent pharmacy acceptance, bounded expiry, and ${queuePlan}.\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

async function verifyPharmacyQueuePlan(
  database: PrismaService,
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<string> {
  const now = new Date();
  const prescriptionIds = Array.from({ length: REPRESENTATIVE_QUEUE_SIZE }, () => v7());
  const pharmacyIds = Array.from({ length: 100 }, () => v7());
  await database.organization.createMany({
    data: pharmacyIds.map((id, index) => ({
      displayName: `Synthetic Query Plan Pharmacy ${index.toString().padStart(3, "0")}`,
      id,
      legalName: `Synthetic Query Plan Pharmacy ${index.toString().padStart(3, "0")} Limited`,
      status: "ACTIVE",
      type: "PHARMACY",
      updatedAt: now,
      verificationStatus: "VERIFIED",
      verifiedAt: now,
    })),
  });
  await database.prescription.createMany({
    data: prescriptionIds.map((id, index) => ({
      attestationMethod: "AUTHENTICATED_PLATFORM_ATTESTATION_V1",
      appointmentId: fixture.appointmentId,
      contentDigest: index.toString(16).padStart(64, "0"),
      id,
      jurisdictionCode: index % 2 === 0 ? "CA-ON" : "DE-BE",
      patientId: fixture.patientId,
      practitionerId: fixture.practitionerId,
      prescriptionNumber: `RX-PLAN-${id}`,
      signedAt: now,
      status: "SIGNED",
      updatedAt: now,
      validUntil: new Date(now.getTime() + 86_400_000),
    })),
  });
  await database.prescriptionRoute.createMany({
    data: prescriptionIds.map((prescriptionId, index) => {
      const pharmacyOrganizationId = pharmacyIds[index % pharmacyIds.length];
      if (pharmacyOrganizationId === undefined) throw new Error("Query-plan pharmacy is missing");
      return {
        id: v7(),
        pharmacyOrganizationId,
        prescriptionId,
        sentAt: new Date(now.getTime() - index * 1_000),
        updatedAt: now,
      };
    }),
  });
  await database.prescription.updateMany({
    data: { status: "SENT", updatedAt: now, version: { increment: 1 } },
    where: { id: { in: prescriptionIds }, status: "SIGNED" },
  });
  await database.$executeRawUnsafe('ANALYZE "prescription_routes"');
  const plans = await database.$queryRawUnsafe<Array<{ "QUERY PLAN": unknown }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT route."id", route."prescription_id", route."sent_at"
         FROM "prescription_routes" AS route
        WHERE route."pharmacy_organization_id" = $1::uuid
          AND route."status" IN ('SENT', 'ACCEPTED')
        ORDER BY route."sent_at" DESC, route."id" DESC
        LIMIT 25`,
    pharmacyIds[0],
  );
  const document = plans[0]?.["QUERY PLAN"] as
    [{ Plan: { Plans?: unknown[]; "Index Name"?: string }; "Execution Time": number }] | undefined;
  const plan = document?.[0];
  if (plan === undefined) throw new Error("PostgreSQL returned no pharmacy queue plan");
  const indexes = collectIndexes(plan.Plan);
  if (!indexes.has("prescription_routes_pharmacy_queue_idx")) {
    throw new Error(`Pharmacy queue plan missed its index; observed: ${[...indexes].join(", ")}`);
  }
  return `indexed ${REPRESENTATIVE_QUEUE_SIZE.toLocaleString("en")} route query (${plan["Execution Time"].toFixed(3)} ms observed)`;
}

function collectIndexes(node: unknown, result = new Set<string>()): Set<string> {
  if (typeof node !== "object" || node === null) return result;
  const record = node as { Plans?: unknown[]; "Index Name"?: unknown };
  if (typeof record["Index Name"] === "string") result.add(record["Index Name"]);
  for (const child of record.Plans ?? []) collectIndexes(child, result);
  return result;
}

async function createFixture(database: PrismaService) {
  const patientPrincipalId = v7();
  const practitionerPrincipalId = v7();
  const pharmacistPrincipalId = v7();
  const workerPrincipalId = v7();
  const patientId = v7();
  const practitionerId = v7();
  const pharmacyOrganizationId = v7();
  const feeId = v7();
  const slotId = v7();
  const appointmentId = v7();
  const startsAt = new Date(Date.now() - 60 * 60_000);
  const endsAt = new Date(Date.now() - 30 * 60_000);
  await database.$transaction(async (transaction) => {
    await transaction.identityPrincipal.createMany({
      data: [
        { id: patientPrincipalId, updatedAt: new Date() },
        { id: practitionerPrincipalId, updatedAt: new Date() },
        { id: pharmacistPrincipalId, updatedAt: new Date() },
        { id: workerPrincipalId, updatedAt: new Date() },
      ],
    });
    await transaction.patient.create({
      data: {
        familyName: "Patient",
        givenName: "Synthetic",
        id: patientId,
        principalId: patientPrincipalId,
        updatedAt: new Date(),
      },
    });
    await transaction.practitioner.create({
      data: {
        displayName: "Synthetic Verified Practitioner",
        familyName: "Practitioner",
        givenName: "Synthetic",
        id: practitionerId,
        principalId: practitionerPrincipalId,
        updatedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    await transaction.organization.create({
      data: {
        displayName: "Synthetic Verified Pharmacy",
        id: pharmacyOrganizationId,
        legalName: "Synthetic Verified Pharmacy Limited",
        status: "ACTIVE",
        type: "PHARMACY",
        updatedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    await transaction.consultationFee.create({
      data: {
        amountMinor: 10_000n,
        approvedByPrincipalId: practitionerPrincipalId,
        createdByPrincipalId: practitionerPrincipalId,
        currency: "EUR",
        effectiveFrom: new Date(startsAt.getTime() - 86_400_000),
        id: feeId,
        mode: "VIDEO",
        practitionerId,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
    await transaction.availabilitySlot.create({
      data: {
        consultationFeeId: feeId,
        createdByPrincipalId: practitionerPrincipalId,
        endsAt,
        id: slotId,
        practitionerId,
        startsAt,
        status: "BOOKED",
        updatedAt: new Date(),
      },
    });
    await transaction.appointment.create({
      data: {
        amountMinor: 10_000n,
        availabilitySlotId: slotId,
        confirmedAt: startsAt,
        currency: "EUR",
        endsAt,
        id: appointmentId,
        mode: "VIDEO",
        patientId,
        paymentDueAt: startsAt,
        practitionerId,
        startsAt,
        status: "COMPLETED",
        updatedAt: new Date(),
      },
    });
  });
  return {
    appointmentId,
    patientId,
    patientPrincipalId,
    pharmacistPrincipalId,
    pharmacyOrganizationId,
    practitionerId,
    practitionerPrincipalId,
    workerPrincipalId,
  };
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

await main();
