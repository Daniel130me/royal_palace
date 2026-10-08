import type { ApiServiceConfig, ServiceConfig } from "@royal-palace/config/environment";
import { v7 } from "uuid";

import { PrismaService } from "../src/platform/database/prisma.service.js";
import { PrismaSchedulingPaymentRepository } from "../src/scheduling/infrastructure/prisma-scheduling-payment.repository.js";
import type { VerifiedPaymentEvent } from "../src/scheduling/domain/scheduling-payment.types.js";
import { requireDisposableDatabase } from "./database-safety.js";

interface Fixture {
  appointmentId: string;
  patientId: string;
  paymentId: string;
  paymentDueAt: Date;
  paymentReference: string;
  principalId: string;
  providerPaymentReference: string;
}

interface PharmacyFixture extends Fixture {
  orderId: string;
  quoteId: string;
}

async function main(): Promise<void> {
  const databaseUrl = requireDisposableDatabase().toString();
  const database = new PrismaService({ databaseUrl } as ServiceConfig);
  const repository = new PrismaSchedulingPaymentRepository(database, {
    notificationDelivery: { mode: "disabled" },
  } as ApiServiceConfig);
  try {
    const payment = await createFixture(database, "lifecycle", new Date(Date.now() + 15 * 60_000));
    const storedAppointment = await database.appointment.findUniqueOrThrow({
      select: { paymentDueAt: true },
      where: { id: payment.appointmentId },
    });
    const storedPayment = await database.payment.findUniqueOrThrow({
      select: { payableUntil: true, purpose: true },
      where: { id: payment.paymentId },
    });
    if (storedAppointment.paymentDueAt.getTime() !== payment.paymentDueAt.getTime()) {
      throw new Error("UTC instant round-trip changed across the Prisma/PostgreSQL boundary");
    }
    if (
      storedPayment.purpose !== "CONSULTATION" ||
      storedPayment.payableUntil.getTime() !== payment.paymentDueAt.getTime()
    ) {
      throw new Error("Payment purpose or independent payable period was not persisted exactly");
    }
    await expectPaymentIdentityMutationRejected(database, payment.paymentId);
    await repository.saveHostedCheckout({
      checkoutUrl: `https://checkout.synthetic.invalid/${payment.paymentId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentId: payment.paymentId,
      providerCode: "SYNTHETIC",
      providerPaymentReference: payment.providerPaymentReference,
      providerSessionReference: `session-${payment.paymentId}`,
    });

    const success = event(payment, "SUCCEEDED", 10_000n);
    const first = await repository.processVerifiedWebhook({
      event: success,
      payloadHash: hash("a"),
    });
    const duplicate = await repository.processVerifiedWebhook({
      event: success,
      payloadHash: hash("a"),
    });
    const delayedFailure = await repository.processVerifiedWebhook({
      event: event(payment, "FAILED", undefined, "delayed-failure"),
      payloadHash: hash("b"),
    });
    const partialRefund = await repository.processVerifiedWebhook({
      event: event(payment, "PARTIALLY_REFUNDED", 2_500n, "partial-refund"),
      payloadHash: hash("c"),
    });
    const finalRefund = await repository.processVerifiedWebhook({
      event: event(payment, "REFUNDED", 7_500n, "final-refund"),
      payloadHash: hash("d"),
    });
    if (
      first.status !== "SUCCEEDED" ||
      !duplicate.duplicate ||
      delayedFailure.status !== "SUCCEEDED" ||
      partialRefund.status !== "PARTIALLY_REFUNDED" ||
      finalRefund.status !== "REFUNDED"
    ) {
      throw new Error("Webhook duplicate, reordering, or refund state verification failed");
    }

    const unknown = await repository.processVerifiedWebhook({
      event: {
        ...success,
        eventId: `unknown-${v7()}`,
        paymentReference: `unknown-${v7()}`,
        providerPaymentReference: `unknown-${v7()}`,
      },
      payloadHash: hash("e"),
    });
    if (unknown.paymentId !== null || unknown.status !== null) {
      throw new Error("Unknown payment reference was not quarantined as evidence");
    }

    const paymentRecord = await database.payment.findUniqueOrThrow({
      include: {
        _count: { select: { ledgerTransactions: true, webhookEvents: true } },
        checkoutSessions: { select: { status: true } },
      },
      where: { id: payment.paymentId },
    });
    if (
      paymentRecord.status !== "REFUNDED" ||
      paymentRecord.refundedAmountMinor !== 10_000n ||
      paymentRecord._count.ledgerTransactions !== 3 ||
      paymentRecord._count.webhookEvents !== 4 ||
      paymentRecord.checkoutSessions.some(({ status }) => status !== "COMPLETED")
    ) {
      throw new Error("Persisted payment evidence or ledger effects are inconsistent");
    }
    const imbalance = await database.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT entry."transaction_id", entry."currency"
            FROM "ledger_entries" AS entry
            JOIN "ledger_transactions" AS transaction ON transaction."id" = entry."transaction_id"
           WHERE transaction."payment_id" = ${payment.paymentId}::uuid
           GROUP BY entry."transaction_id", entry."currency"
          HAVING SUM(CASE WHEN entry."direction" = 'DEBIT' THEN entry."amount_minor" ELSE -entry."amount_minor" END) <> 0
        ) AS imbalance`;
    if (imbalance[0]?.count !== 0n) throw new Error("A persisted ledger transaction is unbalanced");
    const outboxCount = await database.outboxEvent.count({
      where: { aggregateId: payment.paymentId, eventType: "patient.activity.settled.v1" },
    });
    if (outboxCount !== 1) throw new Error("Settled patient activity was not emitted exactly once");

    const reconciliation = await createFixture(
      database,
      "reconciliation",
      new Date(Date.now() + 15 * 60_000),
    );
    await repository.saveHostedCheckout({
      checkoutUrl: `https://checkout.synthetic.invalid/${reconciliation.paymentId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentId: reconciliation.paymentId,
      providerCode: "SYNTHETIC",
      providerPaymentReference: reconciliation.providerPaymentReference,
      providerSessionReference: `session-${reconciliation.paymentId}`,
    });
    const reconciliationResult = await repository.reconcilePayment({
      observation: {
        amountMinor: 10_000n,
        currency: "USD",
        observedAt: new Date(),
        providerPaymentReference: reconciliation.providerPaymentReference,
        status: "SUCCEEDED",
      },
      paymentId: reconciliation.paymentId,
      requestedByPrincipalId: reconciliation.principalId,
    });
    if (!reconciliationResult.applied || reconciliationResult.result !== "MISMATCH_APPLIED") {
      throw new Error("Provider-authoritative reconciliation was not applied");
    }

    const expired = await createFixture(database, "expiry", new Date(Date.now() - 60_000));
    const expirationResult = await repository.expireDueReservations({
      limit: 100,
      now: new Date(),
    });
    const expiredPayment = await database.payment.findUniqueOrThrow({
      include: { appointment: true },
      where: { id: expired.paymentId },
    });
    if (
      expirationResult.expired < 1 ||
      expiredPayment.status !== "EXPIRED" ||
      expiredPayment.appointment === null ||
      expiredPayment.appointment.status !== "EXPIRED"
    ) {
      throw new Error("Reservation timeout did not expire appointment and payment atomically");
    }

    const pharmacy = await createPharmacyFixture(database, "pharmacy-lifecycle");
    await repository.saveHostedCheckout({
      checkoutUrl: `https://checkout.synthetic.invalid/${pharmacy.paymentId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentId: pharmacy.paymentId,
      providerCode: "SYNTHETIC",
      providerPaymentReference: pharmacy.providerPaymentReference,
      providerSessionReference: `session-${pharmacy.paymentId}`,
    });
    const pharmacySuccess = await repository.processVerifiedWebhook({
      event: event(pharmacy, "SUCCEEDED", 2_150n, "pharmacy-success"),
      payloadHash: hash("f"),
    });
    const confirmedOrder = await database.pharmacyOrder.findUniqueOrThrow({
      include: { quote: { include: { inventoryReservation: true } } },
      where: { id: pharmacy.orderId },
    });
    if (
      pharmacySuccess.status !== "SUCCEEDED" ||
      confirmedOrder.status !== "CONFIRMED" ||
      confirmedOrder.quote.inventoryReservation?.status !== "CONSUMED"
    ) {
      throw new Error("Successful pharmacy payment did not confirm the order and consume its hold");
    }
    await repository.processVerifiedWebhook({
      event: event(pharmacy, "PARTIALLY_REFUNDED", 150n, "pharmacy-partial-refund"),
      payloadHash: hash("a"),
    });
    await repository.processVerifiedWebhook({
      event: event(pharmacy, "REFUNDED", 2_000n, "pharmacy-final-refund"),
      payloadHash: hash("b"),
    });
    const refundedOrder = await database.pharmacyOrder.findUniqueOrThrow({
      where: { id: pharmacy.orderId },
    });
    if (refundedOrder.status !== "REFUNDED") {
      throw new Error("Authenticated pharmacy refund facts did not resolve the order");
    }

    const late = await createPharmacyFixture(database, "late-pharmacy-payment");
    await repository.saveHostedCheckout({
      checkoutUrl: `https://checkout.synthetic.invalid/${late.paymentId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentId: late.paymentId,
      providerCode: "SYNTHETIC",
      providerPaymentReference: late.providerPaymentReference,
      providerSessionReference: `session-${late.paymentId}`,
    });
    await repository.processVerifiedWebhook({
      event: {
        ...event(late, "SUCCEEDED", 2_150n, "late-pharmacy-success"),
        occurredAt: new Date(late.paymentDueAt.getTime() + 1),
      },
      payloadHash: hash("c"),
    });
    const rejectedLatePayment = await database.payment.findUniqueOrThrow({
      include: { pharmacyOrder: true },
      where: { id: late.paymentId },
    });
    if (
      rejectedLatePayment.status !== "PENDING" ||
      rejectedLatePayment.pharmacyOrder?.status !== "PENDING_PAYMENT"
    ) {
      throw new Error("Late pharmacy success bypassed the payable-period and inventory guard");
    }

    process.stdout.write(
      "Scheduling/payment verification passed: immutable purpose/payable period, retries, authenticated-event persistence, duplicates, reordering, refunds, pharmacy-order orchestration, late-payment rejection, ledger balance, outbox idempotency, reconciliation, and expiry.\n",
    );
  } finally {
    await database.$disconnect();
  }
}

async function createFixture(
  database: PrismaService,
  label: string,
  paymentDueAt: Date,
): Promise<Fixture> {
  const principalId = v7();
  const patientId = v7();
  const practitionerId = v7();
  const feeId = v7();
  const slotId = v7();
  const appointmentId = v7();
  const paymentId = v7();
  const paymentReference = `payment_${paymentId}`;
  const providerPaymentReference = `provider-${paymentId}`;
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  await database.$transaction(async (transaction) => {
    await transaction.identityPrincipal.create({
      data: { id: principalId, updatedAt: new Date() },
    });
    await transaction.patient.create({
      data: {
        familyName: "Patient",
        givenName: label,
        id: patientId,
        principalId,
        updatedAt: new Date(),
      },
    });
    await transaction.practitioner.create({
      data: {
        displayName: `${label} Practitioner`,
        familyName: "Practitioner",
        givenName: label,
        id: practitionerId,
        updatedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    await transaction.consultationFee.create({
      data: {
        amountMinor: 10_000n,
        approvedByPrincipalId: principalId,
        createdByPrincipalId: principalId,
        currency: "USD",
        effectiveFrom: new Date(Date.now() - 60_000),
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
        createdByPrincipalId: principalId,
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
        currency: "USD",
        endsAt,
        id: appointmentId,
        mode: "VIDEO",
        patientId,
        paymentDueAt,
        practitionerId,
        startsAt,
        updatedAt: new Date(),
      },
    });
    await transaction.payment.create({
      data: {
        amountMinor: 10_000n,
        appointmentId,
        currency: "USD",
        id: paymentId,
        payableUntil: paymentDueAt,
        patientId,
        purpose: "CONSULTATION",
        providerCode: "UNASSIGNED",
        reference: paymentReference,
        updatedAt: new Date(),
      },
    });
  });
  return {
    appointmentId,
    patientId,
    paymentId,
    paymentDueAt,
    paymentReference,
    principalId,
    providerPaymentReference,
  };
}

async function createPharmacyFixture(
  database: PrismaService,
  label: string,
): Promise<PharmacyFixture> {
  const principalId = v7();
  const patientId = v7();
  const practitionerId = v7();
  const pharmacyId = v7();
  const feeId = v7();
  const slotId = v7();
  const appointmentId = v7();
  const prescriptionId = v7();
  const prescriptionItemId = v7();
  const routeId = v7();
  const quoteId = v7();
  const orderId = v7();
  const paymentId = v7();
  const paymentReference = `payment_${paymentId}`;
  const providerPaymentReference = `provider-${paymentId}`;
  const now = new Date();
  const startsAt = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const paymentDueAt = new Date(now.getTime() + 15 * 60_000);

  await database.$transaction(async (transaction) => {
    await transaction.identityPrincipal.create({ data: { id: principalId, updatedAt: now } });
    await transaction.patient.create({
      data: {
        familyName: "Patient",
        givenName: label,
        id: patientId,
        principalId,
        updatedAt: now,
      },
    });
    await transaction.practitioner.create({
      data: {
        displayName: `${label} Practitioner`,
        familyName: "Practitioner",
        givenName: label,
        id: practitionerId,
        updatedAt: now,
        verificationStatus: "VERIFIED",
        verifiedAt: now,
      },
    });
    await transaction.organization.create({
      data: {
        displayName: `${label} Pharmacy`,
        id: pharmacyId,
        legalName: `${label} Pharmacy Limited`,
        type: "PHARMACY",
        updatedAt: now,
        verificationStatus: "VERIFIED",
        verifiedAt: now,
      },
    });
    await transaction.consultationFee.create({
      data: {
        amountMinor: 10_000n,
        approvedByPrincipalId: principalId,
        createdByPrincipalId: principalId,
        currency: "USD",
        effectiveFrom: new Date(now.getTime() - 60_000),
        id: feeId,
        mode: "VIDEO",
        practitionerId,
        status: "ACTIVE",
        updatedAt: now,
      },
    });
    await transaction.availabilitySlot.create({
      data: {
        consultationFeeId: feeId,
        createdByPrincipalId: principalId,
        endsAt,
        id: slotId,
        practitionerId,
        startsAt,
        status: "BOOKED",
        updatedAt: now,
      },
    });
    await transaction.appointment.create({
      data: {
        amountMinor: 10_000n,
        availabilitySlotId: slotId,
        confirmedAt: now,
        currency: "USD",
        endsAt,
        id: appointmentId,
        mode: "VIDEO",
        patientId,
        paymentDueAt,
        practitionerId,
        startsAt,
        status: "CONFIRMED",
        updatedAt: now,
      },
    });
    await transaction.prescription.create({
      data: {
        appointmentId,
        id: prescriptionId,
        items: {
          create: {
            dose: "one tablet",
            frequency: "twice daily",
            id: prescriptionItemId,
            lineNumber: 1,
            medicationName: "Commercial medicine",
            quantity: "2.000",
            quantityUnit: "tablet",
          },
        },
        jurisdictionCode: "GLOBAL.TEST",
        patientId,
        practitionerId,
        prescriptionNumber: `RX-${prescriptionId}`,
        updatedAt: now,
      },
    });
    await transaction.prescription.update({
      data: {
        attestationMethod: "SYNTHETIC_TEST",
        contentDigest: hash("a"),
        signedAt: now,
        status: "SIGNED",
        updatedAt: now,
        validUntil: paymentDueAt,
        version: { increment: 1 },
      },
      where: { id: prescriptionId },
    });
    await transaction.prescriptionRoute.create({
      data: {
        id: routeId,
        pharmacyOrganizationId: pharmacyId,
        prescriptionId,
        sentAt: now,
        status: "SENT",
        updatedAt: now,
      },
    });
    await transaction.prescription.update({
      data: { status: "SENT", updatedAt: now, version: { increment: 1 } },
      where: { id: prescriptionId },
    });
    await transaction.prescriptionRoute.update({
      data: { acceptedAt: now, status: "ACCEPTED", updatedAt: now, version: { increment: 1 } },
      where: { id: routeId },
    });
    await transaction.prescription.update({
      data: { status: "ACCEPTED", updatedAt: now, version: { increment: 1 } },
      where: { id: prescriptionId },
    });
    await transaction.pharmacyQuote.create({
      data: {
        charges: {
          create: [
            { amountMinor: 100n, code: "TEST_TAX", id: v7(), label: "Test tax", type: "TAX" },
            { amountMinor: 50n, code: "TEST_FEE", id: v7(), label: "Test fee", type: "FEE" },
          ],
        },
        createdByPrincipalId: principalId,
        currency: "USD",
        expiresAt: paymentDueAt,
        feeMinor: 50n,
        fillNumber: 0,
        id: quoteId,
        inventoryReservation: {
          create: {
            evidenceHash: hash("b"),
            expiresAt: paymentDueAt,
            id: v7(),
            providerCode: "SYNTHETIC_INVENTORY",
            providerReservationReference: `inventory-${quoteId}`,
            updatedAt: now,
          },
        },
        lines: {
          create: {
            id: v7(),
            lineNumber: 1,
            lineSubtotalMinor: 2_000n,
            medicationName: "Commercial medicine",
            prescriptionItemId,
            quantity: "2.000",
            quantityUnit: "tablet",
            unitPriceMinor: 1_000n,
          },
        },
        patientId,
        pharmacyOrganizationId: pharmacyId,
        prescriptionId,
        prescriptionRouteId: routeId,
        quoteNumber: `QUOTE-${quoteId}`,
        subtotalMinor: 2_000n,
        taxMinor: 100n,
        totalMinor: 2_150n,
        updatedAt: now,
      },
    });
    await transaction.pharmacyQuote.update({
      data: { acceptedAt: now, status: "ACCEPTED", updatedAt: now, version: { increment: 1 } },
      where: { id: quoteId },
    });
    await transaction.pharmacyOrder.create({
      data: {
        acceptedAt: now,
        acceptedByPrincipalId: principalId,
        id: orderId,
        orderNumber: `ORDER-${orderId}`,
        patientId,
        pharmacyOrganizationId: pharmacyId,
        prescriptionId,
        prescriptionRouteId: routeId,
        quoteId,
        updatedAt: now,
      },
    });
    await transaction.payment.create({
      data: {
        amountMinor: 2_150n,
        currency: "USD",
        id: paymentId,
        patientId,
        payableUntil: paymentDueAt,
        pharmacyOrderId: orderId,
        providerCode: "UNASSIGNED",
        purpose: "PHARMACY_ORDER",
        reference: paymentReference,
        updatedAt: now,
      },
    });
  });
  return {
    appointmentId,
    orderId,
    patientId,
    paymentDueAt,
    paymentId,
    paymentReference,
    principalId,
    providerPaymentReference,
    quoteId,
  };
}

async function expectPaymentIdentityMutationRejected(
  database: PrismaService,
  paymentId: string,
): Promise<void> {
  try {
    await database.payment.update({
      data: { payableUntil: new Date(Date.now() + 30 * 60_000) },
      where: { id: paymentId },
    });
  } catch {
    return;
  }
  throw new Error("Payment payable period mutation was not rejected");
}

function event(
  fixture: Fixture,
  eventType: VerifiedPaymentEvent["eventType"],
  amountMinor?: bigint,
  suffix = "success",
): VerifiedPaymentEvent {
  return {
    ...(amountMinor === undefined ? {} : { amountMinor, currency: "USD" }),
    eventId: `${suffix}-${fixture.paymentId}`,
    eventType,
    occurredAt: new Date(),
    paymentReference: fixture.paymentReference,
    providerCode: "SYNTHETIC",
    providerPaymentReference: fixture.providerPaymentReference,
    signatureKeyId: "synthetic-verifier",
  };
}

function hash(character: string): string {
  return character.repeat(64);
}

await main();
