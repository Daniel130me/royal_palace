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
    if (storedAppointment.paymentDueAt.getTime() !== payment.paymentDueAt.getTime()) {
      throw new Error("UTC instant round-trip changed across the Prisma/PostgreSQL boundary");
    }
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
      expiredPayment.appointment.status !== "EXPIRED"
    ) {
      throw new Error("Reservation timeout did not expire appointment and payment atomically");
    }

    process.stdout.write(
      "Scheduling/payment verification passed: retries, authenticated-event persistence, duplicates, reordering, refunds, ledger balance, outbox idempotency, reconciliation, and expiry.\n",
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
        patientId,
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
