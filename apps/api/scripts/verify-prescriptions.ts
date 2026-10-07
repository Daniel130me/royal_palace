import type { ServiceConfig } from "@royal-palace/config/environment";
import { v7 } from "uuid";

import { PrismaPrescriptionRepository } from "../src/pharmacy/infrastructure/prisma-prescription.repository.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { requireDisposableDatabase } from "./database-safety.js";

const REPRESENTATIVE_QUEUE_SIZE = 5_000;

async function main(): Promise<void> {
  const databaseUrl = requireDisposableDatabase().toString();
  const database = new PrismaService({ databaseUrl } as ServiceConfig);
  const notificationConfig = { notificationDelivery: { mode: "disabled" as const } };
  const repository = new PrismaPrescriptionRepository(database, notificationConfig);
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
            refillsAuthorized: 1,
            substitutionAllowed: true,
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
    const peerRepository = new PrismaPrescriptionRepository(peerDatabase, notificationConfig);
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

    const policyId = v7();
    await database.prescriptionJurisdictionPolicy.create({
      data: {
        effectiveFrom: new Date(Date.now() - 60_000),
        id: policyId,
        jurisdictionCode: "CA-ON",
        substitutionApprovalMode: "PATIENT_AND_PRACTITIONER",
        updatedAt: new Date(),
      },
    });
    await expectDatabaseRejection(
      () =>
        database.prescriptionJurisdictionPolicy.create({
          data: {
            effectiveFrom: new Date(Date.now() - 30_000),
            id: v7(),
            jurisdictionCode: "CA-ON",
            substitutionApprovalMode: "PATIENT_ONLY",
            updatedAt: new Date(),
          },
        }),
      "Overlapping jurisdiction policy windows were not rejected",
    );
    await expectDatabaseRejection(
      () =>
        database.prescriptionJurisdictionPolicy.update({
          data: { substitutionApprovalMode: "PATIENT_ONLY" },
          where: { id: policyId },
        }),
      "A jurisdiction policy version was rewritten after creation",
    );
    let dispensingPrescription = await requirePrescription(repository, routed.id);
    if (dispensingPrescription.status !== "ACCEPTED") {
      throw new Error("Accepted prescription was not available for dispensing verification");
    }
    const prescriptionItem = dispensingPrescription.items[0];
    if (prescriptionItem === undefined) throw new Error("Dispensing fixture item is missing");
    const acceptedRoute = dispensingPrescription.routes.find(
      (route) => route.status === "ACCEPTED",
    );
    if (acceptedRoute === undefined) throw new Error("Accepted dispensing route is missing");
    const unchangedProposal = await repository.createSubstitutionProposal({
      actorPrincipalId: fixture.pharmacistPrincipalId,
      expectedVersion: dispensingPrescription.version,
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: dispensingPrescription.id,
      proposal: {
        fillNumber: 0,
        prescriptionItemId: prescriptionItem.id,
        proposedMedicationCode: prescriptionItem.medicationCode ?? undefined,
        proposedMedicationCodeSystem: prescriptionItem.medicationCodeSystem ?? undefined,
        proposedMedicationName: prescriptionItem.medicationName,
        proposedStrength: prescriptionItem.strength ?? undefined,
        reasonCode: "no_material_change",
      },
    });
    if (unchangedProposal !== null) {
      throw new Error("A substitution proposal with unchanged medication identity was accepted");
    }
    const futureFillProposal = await repository.createSubstitutionProposal({
      actorPrincipalId: fixture.pharmacistPrincipalId,
      expectedVersion: dispensingPrescription.version,
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: dispensingPrescription.id,
      proposal: {
        fillNumber: 1,
        prescriptionItemId: prescriptionItem.id,
        proposedMedicationName: "Synthetic future-fill medicine",
        reasonCode: "future_fill_requested_early",
      },
    });
    if (futureFillProposal !== null) {
      throw new Error("A later-fill substitution was accepted before the prior fill completed");
    }
    await expectDatabaseRejection(
      () =>
        database.$executeRawUnsafe(
          `INSERT INTO "prescription_substitution_proposals"
             ("id", "prescription_id", "prescription_item_id", "route_id", "fill_number",
              "proposed_medication_name", "reason_code", "jurisdiction_policy_id",
              "approval_mode", "created_by_principal_id", "updated_at")
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1,
                   'Synthetic future-fill database medicine', 'future_fill_requested_early',
                   $5::uuid, 'PATIENT_AND_PRACTITIONER', $6::uuid, now())`,
          v7(),
          dispensingPrescription.id,
          prescriptionItem.id,
          acceptedRoute.id,
          policyId,
          fixture.pharmacistPrincipalId,
        ),
      "Database allowed a later-fill substitution before the prior fill completed",
    );
    const proposal = await repository.createSubstitutionProposal({
      actorPrincipalId: fixture.pharmacistPrincipalId,
      expectedVersion: dispensingPrescription.version,
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: dispensingPrescription.id,
      proposal: {
        fillNumber: 0,
        prescriptionItemId: prescriptionItem.id,
        proposedMedicationCode: "SYNTH-GENERIC-001",
        proposedMedicationCodeSystem: "https://terminology.synthetic.invalid/medicines",
        proposedMedicationName: "Synthetic generic medicine",
        reasonCode: "generic_available",
      },
    });
    if (proposal?.status !== "PROPOSED") throw new Error("Substitution was not proposed");
    dispensingPrescription = await requirePrescription(repository, routed.id);
    const consented = await repository.decideSubstitution({
      actorPrincipalId: fixture.patientPrincipalId,
      decisionKind: "PATIENT_CONSENT",
      expectedVersion: dispensingPrescription.version,
      outcome: "APPROVED",
      prescriptionId: dispensingPrescription.id,
      proposalId: proposal.id,
    });
    if (consented?.status !== "PATIENT_CONSENTED") {
      throw new Error("Patient substitution consent was not persisted");
    }
    dispensingPrescription = await requirePrescription(repository, routed.id);
    const approved = await repository.decideSubstitution({
      actorPrincipalId: fixture.practitionerPrincipalId,
      decisionKind: "PRACTITIONER_APPROVAL",
      expectedVersion: dispensingPrescription.version,
      outcome: "APPROVED",
      prescriptionId: dispensingPrescription.id,
      proposalId: proposal.id,
    });
    if (approved?.status !== "APPROVED") {
      throw new Error("Practitioner substitution approval was not persisted");
    }
    await expectDatabaseRejection(
      () =>
        database.prescriptionSubstitutionDecision.update({
          data: { outcome: "DECLINED" },
          where: {
            proposalId_decisionKind: {
              decisionKind: "PATIENT_CONSENT",
              proposalId: proposal.id,
            },
          },
        }),
      "Substitution decision mutation was not rejected",
    );

    dispensingPrescription = await requirePrescription(repository, routed.id);
    const firstDispenseId = v7();
    const firstDispense = {
      actorPrincipalId: fixture.pharmacistPrincipalId,
      dispenseEventId: firstDispenseId,
      expectedVersion: dispensingPrescription.version,
      lines: [
        {
          fillNumber: 0,
          prescriptionItemId: prescriptionItem.id,
          quantity: "5",
          substitutionProposalId: proposal.id,
        },
      ],
      occurredAt: new Date(),
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: dispensingPrescription.id,
      requestDigest: "c".repeat(64),
    };
    const firstDispenseEvent = await repository.dispense(firstDispense);
    if (firstDispenseEvent?.eventNumber !== 1) throw new Error("Partial dispense was not recorded");
    const replayed = await repository.dispense({ ...firstDispense, expectedVersion: 1 });
    if (replayed?.id !== firstDispenseId) throw new Error("Dispense retry was not idempotent");
    await expectDatabaseRejection(
      () =>
        database.prescriptionDispenseLine.update({
          data: { quantity: "6" },
          where: { id: firstDispenseEvent.lines[0]?.id ?? "" },
        }),
      "Dispense fact mutation was not rejected",
    );

    dispensingPrescription = await requirePrescription(repository, routed.id);
    const refillConflictVersion = dispensingPrescription.version;
    await expectRepositoryRejection(
      () =>
        repository.dispense({
          ...firstDispense,
          dispenseEventId: v7(),
          expectedVersion: refillConflictVersion,
          lines: [{ fillNumber: 1, prescriptionItemId: prescriptionItem.id, quantity: "1" }],
          requestDigest: "d".repeat(64),
        }),
      "A refill was allowed before the prior fill was complete",
    );
    const secondDispenseRequest = {
      ...firstDispense,
      dispenseEventId: v7(),
      expectedVersion: dispensingPrescription.version,
      lines: [
        {
          fillNumber: 0,
          prescriptionItemId: prescriptionItem.id,
          quantity: "5",
          substitutionProposalId: proposal.id,
        },
      ],
      requestDigest: "e".repeat(64),
    };
    const replayPeerDatabase = new PrismaService({ databaseUrl } as ServiceConfig);
    const replayPeer = new PrismaPrescriptionRepository(replayPeerDatabase, notificationConfig);
    const concurrentRetries = await Promise.all([
      repository.dispense(secondDispenseRequest),
      replayPeer.dispense(secondDispenseRequest),
    ]).finally(() => replayPeerDatabase.$disconnect());
    if (
      concurrentRetries.some(
        (event) => event?.id !== secondDispenseRequest.dispenseEventId || event?.eventNumber !== 2,
      )
    ) {
      throw new Error("Concurrent identical dispense retries did not resolve idempotently");
    }
    dispensingPrescription = await requirePrescription(repository, routed.id);
    const completedDispense = await repository.dispense({
      ...firstDispense,
      dispenseEventId: v7(),
      expectedVersion: dispensingPrescription.version,
      lines: [{ fillNumber: 1, prescriptionItemId: prescriptionItem.id, quantity: "10" }],
      requestDigest: "f".repeat(64),
    });
    dispensingPrescription = await requirePrescription(repository, routed.id);
    if (completedDispense?.eventNumber !== 3 || dispensingPrescription.status !== "DISPENSED") {
      throw new Error("Refill completion did not produce a terminal dispensed prescription");
    }
    const finalBalance = dispensingPrescription.items[0]?.balance;
    if (finalBalance?.remainingQuantity !== "0" || finalBalance.fills.length !== 2) {
      throw new Error("Per-item quantity and refill balances are incorrect");
    }

    const returnCandidate = await createAcceptedPrescription(repository, fixture, "RETURN");
    const returned = await repository.returnToPatient({
      actorPrincipalId: fixture.pharmacistPrincipalId,
      expectedVersion: returnCandidate.version,
      organizationId: fixture.pharmacyOrganizationId,
      prescriptionId: returnCandidate.id,
      reasonCode: "stock_unavailable",
    });
    const returnedRoute = returned?.routes.at(-1);
    if (
      returned?.status !== "SIGNED" ||
      returnedRoute?.status !== "CANCELLED" ||
      returnedRoute.cancellationReasonCode !== "stock_unavailable"
    ) {
      throw new Error("Undispensed prescription was not safely returned for patient rerouting");
    }

    const cancellationCandidate = await createAcceptedPrescription(repository, fixture, "CANCEL");
    const cancellationPeerDatabase = new PrismaService({ databaseUrl } as ServiceConfig);
    const cancellationPeer = new PrismaPrescriptionRepository(
      cancellationPeerDatabase,
      notificationConfig,
    );
    const cancellationItem = cancellationCandidate.items[0];
    if (cancellationItem === undefined) throw new Error("Cancellation fixture item is missing");
    const cancellationRace = await Promise.allSettled([
      repository.cancel({
        actorPrincipalId: fixture.practitionerPrincipalId,
        expectedVersion: cancellationCandidate.version,
        prescriptionId: cancellationCandidate.id,
        reasonCode: "therapy_changed",
      }),
      cancellationPeer.dispense({
        actorPrincipalId: fixture.pharmacistPrincipalId,
        dispenseEventId: v7(),
        expectedVersion: cancellationCandidate.version,
        lines: [{ fillNumber: 0, prescriptionItemId: cancellationItem.id, quantity: "1" }],
        occurredAt: new Date(),
        organizationId: fixture.pharmacyOrganizationId,
        prescriptionId: cancellationCandidate.id,
        requestDigest: "1".repeat(64),
      }),
    ]).finally(() => cancellationPeerDatabase.$disconnect());
    const cancellationWinners = cancellationRace.filter(
      (attempt) => attempt.status === "fulfilled" && attempt.value !== null,
    ).length;
    const cancellationResult = await requirePrescription(repository, cancellationCandidate.id);
    if (
      cancellationWinners !== 1 ||
      !["CANCELLED", "DISPENSED"].includes(cancellationResult.status)
    ) {
      throw new Error("Concurrent cancellation and dispensing did not produce one legal winner");
    }

    const expiryCandidate = await createAcceptedPrescription(repository, fixture, "EXPIRY", 60_000);
    const expiryPeerDatabase = new PrismaService({ databaseUrl } as ServiceConfig);
    const expiryPeer = new PrismaPrescriptionRepository(expiryPeerDatabase, notificationConfig);
    const expiryItem = expiryCandidate.items[0];
    if (expiryItem === undefined) throw new Error("Expiry race fixture item is missing");
    await Promise.allSettled([
      repository.expireDue({
        actorPrincipalId: fixture.workerPrincipalId,
        limit: 10,
        now: new Date(Date.now() + 120_000),
      }),
      expiryPeer.dispense({
        actorPrincipalId: fixture.pharmacistPrincipalId,
        dispenseEventId: v7(),
        expectedVersion: expiryCandidate.version,
        lines: [{ fillNumber: 0, prescriptionItemId: expiryItem.id, quantity: "1" }],
        occurredAt: new Date(),
        organizationId: fixture.pharmacyOrganizationId,
        prescriptionId: expiryCandidate.id,
        requestDigest: "2".repeat(64),
      }),
    ]).finally(() => expiryPeerDatabase.$disconnect());
    const expiryRaceResult = await requirePrescription(repository, expiryCandidate.id);
    if (!["EXPIRED", "DISPENSED"].includes(expiryRaceResult.status)) {
      throw new Error("Concurrent expiry and dispensing produced an illegal state");
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
      `Prescription verification passed: signing immutability, temporal policy guards, consented substitution, proposal/refill ordering, immutable concurrent-idempotent dispense events, quantity/refill accounting, safe return/rerouting, cancellation/expiry concurrency, patient routing, concurrent pharmacy acceptance, bounded expiry, and ${queuePlan}.\n`,
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

async function createAcceptedPrescription(
  repository: PrismaPrescriptionRepository,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  label: string,
  validityMilliseconds = 86_400_000,
) {
  const draft = await repository.createDraft({
    actorPrincipalId: fixture.practitionerPrincipalId,
    draft: {
      appointmentId: fixture.appointmentId,
      items: [
        {
          controlledMedication: false,
          dose: "one unit",
          frequency: "once",
          medicationName: `Synthetic ${label.toLowerCase()} medicine`,
          quantity: "1",
          quantityUnit: "unit",
          refillsAuthorized: 0,
          substitutionAllowed: false,
        },
      ],
      jurisdictionCode: "CA-ON",
      patientId: fixture.patientId,
    },
    practitionerId: fixture.practitionerId,
  });
  const signed = await repository.sign({
    actorPrincipalId: fixture.practitionerPrincipalId,
    attestationMethod: "AUTHENTICATED_PLATFORM_ATTESTATION_V1",
    contentDigest: "a".repeat(64),
    expectedVersion: draft.version,
    prescriptionId: draft.id,
    validUntil: new Date(Date.now() + validityMilliseconds),
  });
  if (signed === null) throw new Error(`${label} fixture could not be signed`);
  const routed = await repository.routeToPharmacy({
    actorPrincipalId: fixture.patientPrincipalId,
    expectedVersion: signed.version,
    pharmacyOrganizationId: fixture.pharmacyOrganizationId,
    prescriptionId: signed.id,
  });
  if (routed === null) throw new Error(`${label} fixture could not be routed`);
  const accepted = await repository.acceptAtPharmacy({
    actorPrincipalId: fixture.pharmacistPrincipalId,
    expectedVersion: routed.version,
    organizationId: fixture.pharmacyOrganizationId,
    prescriptionId: routed.id,
  });
  if (accepted === null) throw new Error(`${label} fixture could not be accepted`);
  return accepted;
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

async function expectRepositoryRejection(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    const result = await operation();
    if (result === null) return;
  } catch {
    return;
  }
  throw new Error(message);
}

async function requirePrescription(
  repository: PrismaPrescriptionRepository,
  prescriptionId: string,
) {
  const prescription = await repository.findById(prescriptionId);
  if (prescription === null) throw new Error("Prescription fixture disappeared");
  return prescription;
}

await main();
