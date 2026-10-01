import { cp, mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import pg from "pg";
import { v7 } from "uuid";

import {
  databaseUrlWithName,
  prismaRoot,
  quoteIdentifier,
  requireDisposableDatabase,
  runPrismaMigration,
} from "./database-safety.js";

const { Client } = pg;
const FIRST_MIGRATION = "20260928120000_foundation_identity_and_organizations";

async function main(): Promise<void> {
  const baseUrl = requireDisposableDatabase();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseNames = {
    clean: `rp_clean_${suffix}`,
    repair: `rp_repair_${suffix}`,
    upgrade: `rp_upgrade_${suffix}`,
  } as const;
  const adminUrl = databaseUrlWithName(baseUrl, "postgres");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "royal-palace-migrations-"));
  const admin = new Client({ connectionString: adminUrl });

  await admin.connect();
  try {
    for (const databaseName of Object.values(databaseNames)) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }

    await runPrismaMigration(
      join(prismaRoot, "schema.prisma"),
      databaseUrlWithName(baseUrl, databaseNames.clean),
    );

    const priorSchemaRoot = join(temporaryRoot, "prisma");
    await mkdir(join(priorSchemaRoot, "migrations"), { recursive: true });
    await cp(join(prismaRoot, "schema.prisma"), join(priorSchemaRoot, "schema.prisma"));
    await cp(
      join(prismaRoot, "migrations", "migration_lock.toml"),
      join(priorSchemaRoot, "migrations", "migration_lock.toml"),
    );
    await cp(
      join(prismaRoot, "migrations", FIRST_MIGRATION),
      join(priorSchemaRoot, "migrations", FIRST_MIGRATION),
      { recursive: true },
    );

    for (const databaseName of [databaseNames.upgrade, databaseNames.repair]) {
      await runPrismaMigration(
        join(priorSchemaRoot, "schema.prisma"),
        databaseUrlWithName(baseUrl, databaseName),
      );
    }

    await runPrismaMigration(
      join(prismaRoot, "schema.prisma"),
      databaseUrlWithName(baseUrl, databaseNames.upgrade),
    );

    await rehearseTransactionalRepair(databaseUrlWithName(baseUrl, databaseNames.repair));
    await runPrismaMigration(
      join(prismaRoot, "schema.prisma"),
      databaseUrlWithName(baseUrl, databaseNames.repair),
    );
    await verifyDatabaseInvariants(databaseUrlWithName(baseUrl, databaseNames.clean));
    await verifyConcurrentBooking(databaseUrlWithName(baseUrl, databaseNames.clean));
    await assertMigrationsAreTransactional();

    process.stdout.write(
      "Migration verification passed: clean install, prior-schema upgrade, transactional repair, and constraints.\n",
    );
  } finally {
    for (const databaseName of Object.values(databaseNames).reverse()) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
        [databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function rehearseTransactionalRepair(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('CREATE TABLE "migration_repair_probe" ("id" INTEGER PRIMARY KEY)');
    try {
      await client.query('INSERT INTO "missing_table" ("id") VALUES (1)');
    } catch {
      await client.query("ROLLBACK");
    }
    const result = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migration_repair_probe'",
    );
    if (result.rowCount !== 0) {
      throw new Error("A failed transactional migration left partial schema changes behind");
    }
  } finally {
    await client.end();
  }
}

async function verifyDatabaseInvariants(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  const principalId = v7();
  const organizationId = v7();
  const membershipId = v7();
  const externalIdentityId = v7();
  const sessionId = v7();
  const auditId = v7();
  const verifiedOrganizationId = v7();
  const practitionerId = v7();
  const applicationId = v7();
  const applicationHistoryId = v7();
  const parentSpecialtyId = v7();
  const childSpecialtyId = v7();
  const managerProfileId = v7();
  const referralLinkId = v7();
  const referralEventId = v7();
  const commissionPolicyId = v7();
  const patientId = v7();
  const settlementId = v7();
  const earningId = v7();
  const ticketId = v7();
  const followUpId = v7();
  const consultationFeeId = v7();
  const availabilitySlotId = v7();
  const appointmentId = v7();
  const paymentId = v7();
  const inboxEventId = v7();
  const webhookEventId = v7();
  const paymentHistoryId = v7();
  const ledgerTransactionId = v7();
  const ledgerDebitId = v7();
  const ledgerCreditId = v7();

  await client.connect();
  try {
    await client.query(
      'INSERT INTO "identity_principals" ("id", "updated_at") VALUES ($1, now())',
      [principalId],
    );
    await client.query(
      'INSERT INTO "external_identities" ("id", "principal_id", "issuer", "subject") VALUES ($1, $2, $3, $4)',
      [externalIdentityId, principalId, "https://verification.synthetic.invalid", "principal"],
    );
    await client.query(
      'INSERT INTO "organizations" ("id", "type", "legal_name", "display_name", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [organizationId, "HOSPITAL", "Synthetic Hospital Limited", "Synthetic Hospital"],
    );
    await expectSqlState(
      client,
      'INSERT INTO "organizations" ("id", "type", "verification_status", "legal_name", "display_name", "updated_at") VALUES ($1, $2, $3, $4, $5, now())',
      [
        verifiedOrganizationId,
        "HOSPITAL",
        "VERIFIED",
        "Invalid Hospital Limited",
        "Invalid Hospital",
      ],
      "23514",
    );
    await client.query(
      'INSERT INTO "organizations" ("id", "type", "verification_status", "verified_at", "legal_name", "display_name", "updated_at") VALUES ($1, $2, $3, now(), $4, $5, now())',
      [
        verifiedOrganizationId,
        "HOSPITAL",
        "VERIFIED",
        "Verified Synthetic Hospital Limited",
        "Verified Synthetic Hospital",
      ],
    );
    await expectSqlState(
      client,
      'INSERT INTO "organization_public_profiles" ("organization_id", "slug", "status", "updated_at") VALUES ($1, $2, $3, now())',
      [verifiedOrganizationId, "missing-published-at", "PUBLISHED"],
      "23514",
    );
    await expectSqlState(
      client,
      'INSERT INTO "facility_locations" ("id", "organization_id", "label", "address_line_1", "locality", "administrative_area", "country_code", "latitude", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
      [v7(), verifiedOrganizationId, "Main", "Address", "Ikeja", "Lagos", "NG", 6.5],
      "23514",
    );
    await expectSqlState(
      client,
      'INSERT INTO "facility_locations" ("id", "organization_id", "label", "country_code", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [v7(), verifiedOrganizationId, "Location without an address", "CH"],
      "23514",
    );
    await expectSqlState(
      client,
      'INSERT INTO "practitioners" ("id", "display_name", "given_name", "family_name", "verification_status", "updated_at") VALUES ($1, $2, $3, $4, $5, now())',
      [practitionerId, "Invalid Verified Person", "Invalid", "Person", "VERIFIED"],
      "23514",
    );
    await client.query(
      'INSERT INTO "practitioners" ("id", "display_name", "given_name", "family_name", "verification_status", "verified_at", "updated_at") VALUES ($1, $2, $3, $4, $5, now(), now())',
      [practitionerId, "Verified Synthetic Person", "Synthetic", "Person", "VERIFIED"],
    );
    await expectSqlState(
      client,
      'INSERT INTO "practitioner_public_profiles" ("practitioner_id", "slug", "status", "updated_at") VALUES ($1, $2, $3, now())',
      [practitionerId, "missing-practitioner-published-at", "PUBLISHED"],
      "23514",
    );
    await expectSqlState(
      client,
      'INSERT INTO "practitioner_locations" ("id", "practitioner_id", "label", "locality", "country_code", "updated_at") VALUES ($1, $2, $3, $4, $5, now())',
      [v7(), practitionerId, "Invalid country", "Toronto", "ca"],
      "23514",
    );
    await expectSqlState(
      client,
      'INSERT INTO "practitioner_languages" ("id", "practitioner_id", "language_tag") VALUES ($1, $2, $3)',
      [v7(), practitionerId, "not_a_bcp47_tag"],
      "23514",
    );
    await client.query(
      'INSERT INTO "memberships" ("id", "organization_id", "principal_id", "updated_at") VALUES ($1, $2, $3, now())',
      [membershipId, organizationId, principalId],
    );

    await expectSqlState(
      client,
      'INSERT INTO "external_identities" ("id", "principal_id", "issuer", "subject") VALUES ($1, $2, $3, $4)',
      [v7(), principalId, "https://verification.synthetic.invalid", "principal"],
      "23505",
    );
    await expectSqlState(
      client,
      'INSERT INTO "memberships" ("id", "organization_id", "principal_id", "updated_at") VALUES ($1, $2, $3, now())',
      [v7(), organizationId, principalId],
      "23505",
    );
    await expectSqlState(
      client,
      'INSERT INTO "idempotency_keys" ("id", "principal_id", "operation", "key", "request_hash", "updated_at", "expires_at") VALUES ($1, $2, $3, $4, $5, now(), now() + interval \'1 hour\')',
      [v7(), principalId, "verification", "key", "not-a-sha256-hash"],
      "23514",
    );
    await client.query(
      `INSERT INTO "auth_sessions" (
         "id", "principal_id", "external_identity_id", "csrf_secret_hash",
         "authenticated_at", "updated_at", "idle_expires_at", "absolute_expires_at"
       ) VALUES ($1, $2, $3, $4, now(), now(), now() + interval '15 minutes', now() + interval '8 hours')`,
      [sessionId, principalId, externalIdentityId, "a".repeat(64)],
    );
    await expectSqlState(
      client,
      'UPDATE "auth_sessions" SET "status" = \'REVOKED\', "updated_at" = now() WHERE "id" = $1',
      [sessionId],
      "23514",
    );
    await client.query(
      'INSERT INTO "audit_events" ("id", "actor_principal_id", "action", "resource_type", "resource_id", "result", "request_id") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        auditId,
        principalId,
        "verification.read",
        "organization",
        organizationId,
        "SUCCEEDED",
        v7(),
      ],
    );
    await expectSqlState(
      client,
      'UPDATE "audit_events" SET "action" = $1 WHERE "id" = $2',
      ["verification.changed", auditId],
      "P0001",
    );
    await client.query("BEGIN");
    await client.query(
      'INSERT INTO "onboarding_applications" ("id", "kind", "applicant_principal_id", "updated_at") VALUES ($1, $2, $3, now())',
      [applicationId, "PATIENT", principalId],
    );
    await client.query(
      'INSERT INTO "patient_application_details" ("application_id", "given_name", "family_name", "country_code") VALUES ($1, $2, $3, $4)',
      [applicationId, "Synthetic", "Applicant", "GB"],
    );
    await client.query(
      'INSERT INTO "application_status_history" ("id", "application_id", "to_status", "reason_category", "note_visibility", "request_id") VALUES ($1, $2, $3, $4, $5, $6)',
      [applicationHistoryId, applicationId, "DRAFT", "APPLICATION_CREATED", "APPLICANT", v7()],
    );
    await client.query("COMMIT");
    await expectSqlState(
      client,
      'UPDATE "application_status_history" SET "reason_category" = $1 WHERE "id" = $2',
      ["MUTATED", applicationHistoryId],
      "P0001",
    );
    await expectSqlState(
      client,
      'DELETE FROM "application_status_history" WHERE "id" = $1',
      [applicationHistoryId],
      "P0001",
    );
    await expectSqlState(
      client,
      'UPDATE "onboarding_applications" SET "kind" = $1, "updated_at" = now() WHERE "id" = $2',
      ["ORGANIZATION", applicationId],
      "P0001",
    );
    await expectSqlState(
      client,
      'INSERT INTO "onboarding_applications" ("id", "kind", "applicant_principal_id", "updated_at") VALUES ($1, $2, $3, now())',
      [v7(), "PATIENT", principalId],
      "23505",
    );
    await expectSqlState(
      client,
      'INSERT INTO "application_documents" ("id", "application_id", "purpose", "original_filename", "declared_content_type", "declared_size_bytes", "declared_sha256", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
      [v7(), applicationId, "IDENTITY", "identity.pdf", "application/pdf", 100, "invalid"],
      "23514",
    );
    await expectSqlState(
      client,
      'UPDATE "onboarding_applications" SET "status" = $1, "updated_at" = now() WHERE "id" = $2',
      ["SUBMITTED", applicationId],
      "23514",
    );
    await client.query(
      'INSERT INTO "manager_profiles" ("id", "principal_id", "display_name", "updated_at") VALUES ($1, $2, $3, now())',
      [managerProfileId, principalId, "Synthetic Manager"],
    );
    await client.query(
      'INSERT INTO "referral_links" ("id", "manager_profile_id", "audience", "label", "signing_key_id", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [
        referralLinkId,
        managerProfileId,
        "PATIENT",
        "Synthetic patient referral",
        "verification-key",
        principalId,
      ],
    );
    await client.query(
      'INSERT INTO "referral_attribution_events" ("id", "application_id", "event_type", "referral_link_id", "manager_profile_id", "actor_principal_id", "reason_category", "request_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        referralEventId,
        applicationId,
        "ATTRIBUTED",
        referralLinkId,
        managerProfileId,
        principalId,
        "REFERRAL_CLAIMED",
        v7(),
      ],
    );
    await client.query(
      'INSERT INTO "current_referral_attributions" ("application_id", "current_event_id", "manager_profile_id", "referral_link_id", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [applicationId, referralEventId, managerProfileId, referralLinkId],
    );
    await expectSqlState(
      client,
      'UPDATE "referral_attribution_events" SET "reason_category" = $1 WHERE "id" = $2',
      ["MUTATED", referralEventId],
      "P0001",
    );
    await client.query(
      'INSERT INTO "commission_policies" ("id", "manager_profile_id", "activity_type", "currency", "rate_bps", "effective_from", "effective_until", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, now(), now() + interval \'1 year\', $6, $7, $7, now())',
      [commissionPolicyId, managerProfileId, "CONSULTATION", "USD", 500, "ACTIVE", principalId],
    );
    await expectSqlState(
      client,
      'INSERT INTO "commission_policies" ("id", "manager_profile_id", "activity_type", "currency", "rate_bps", "effective_from", "effective_until", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, now() + interval \'1 day\', now() + interval \'2 days\', $6, $7, $7, now())',
      [v7(), managerProfileId, "CONSULTATION", "USD", 700, "ACTIVE", principalId],
      "23P01",
    );
    await client.query(
      'INSERT INTO "patients" ("id", "principal_id", "given_name", "family_name", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [patientId, principalId, "Synthetic", "Applicant"],
    );
    await client.query(
      'UPDATE "onboarding_applications" SET "status" = \'APPROVED\', "submitted_at" = now(), "decided_at" = now(), "decided_by_principal_id" = $1, "approved_patient_id" = $2, "updated_at" = now() WHERE "id" = $3',
      [principalId, patientId, applicationId],
    );
    await client.query(
      'INSERT INTO "patient_activity_settlements" ("id", "patient_id", "source_event_key", "source_type", "activity_type", "gross_amount_minor", "currency", "settled_at", "recorded_by_principal_id") VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)',
      [
        settlementId,
        patientId,
        `migration-verification-${settlementId}`,
        "SYNTHETIC",
        "CONSULTATION",
        10000,
        "USD",
        principalId,
      ],
    );
    await client.query(
      'INSERT INTO "manager_earnings" ("id", "event_key", "manager_profile_id", "settlement_id", "policy_id", "activity_type", "amount_minor", "currency", "entry_type", "occurred_at") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())',
      [
        earningId,
        `migration-verification-${earningId}`,
        managerProfileId,
        settlementId,
        commissionPolicyId,
        "CONSULTATION",
        500,
        "USD",
        "EARNING",
      ],
    );
    await expectSqlState(
      client,
      'UPDATE "manager_earnings" SET "amount_minor" = $1 WHERE "id" = $2',
      [600, earningId],
      "P0001",
    );
    await client.query(
      'INSERT INTO "manager_support_tickets" ("id", "ticket_number", "manager_profile_id", "subject_display_name", "category", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [
        ticketId,
        `RPT-${ticketId.replaceAll("-", "").slice(0, 20)}`,
        managerProfileId,
        "Synthetic Applicant",
        "ONBOARDING",
        principalId,
      ],
    );
    await client.query(
      'INSERT INTO "manager_ticket_follow_ups" ("id", "ticket_id", "author_principal_id", "body", "visibility") VALUES ($1, $2, $3, $4, $5)',
      [followUpId, ticketId, principalId, "Synthetic follow-up", "MANAGER"],
    );
    await expectSqlState(
      client,
      'DELETE FROM "manager_ticket_follow_ups" WHERE "id" = $1',
      [followUpId],
      "P0001",
    );
    await client.query(
      'INSERT INTO "consultation_fees" ("id", "practitioner_id", "mode", "amount_minor", "currency", "effective_from", "effective_until", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, now(), now() + interval \'30 days\', $6, $7, $7, now())',
      [consultationFeeId, practitionerId, "VIDEO", 12500, "USD", "ACTIVE", principalId],
    );
    await expectSqlState(
      client,
      'INSERT INTO "consultation_fees" ("id", "practitioner_id", "mode", "amount_minor", "currency", "effective_from", "effective_until", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, now() + interval \'1 day\', now() + interval \'2 days\', $6, $7, $7, now())',
      [v7(), practitionerId, "VIDEO", 13000, "USD", "ACTIVE", principalId],
      "23P01",
    );
    await client.query(
      'INSERT INTO "availability_slots" ("id", "practitioner_id", "consultation_fee_id", "starts_at", "ends_at", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, now() + interval \'2 days\', now() + interval \'2 days 30 minutes\', $4, now())',
      [availabilitySlotId, practitionerId, consultationFeeId, principalId],
    );
    await expectSqlState(
      client,
      'INSERT INTO "availability_slots" ("id", "practitioner_id", "consultation_fee_id", "starts_at", "ends_at", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, now() + interval \'2 days 15 minutes\', now() + interval \'2 days 45 minutes\', $4, now())',
      [v7(), practitionerId, consultationFeeId, principalId],
      "23P01",
    );
    await client.query(
      'UPDATE "availability_slots" SET "status" = \'BOOKED\', "updated_at" = now() WHERE "id" = $1',
      [availabilitySlotId],
    );
    await client.query(
      'INSERT INTO "appointments" ("id", "patient_id", "practitioner_id", "availability_slot_id", "mode", "starts_at", "ends_at", "amount_minor", "currency", "payment_due_at", "updated_at") SELECT $1, $2, $3, $4, $5, "starts_at", "ends_at", $6, $7, now() + interval \'15 minutes\', now() FROM "availability_slots" WHERE "id" = $4',
      [appointmentId, patientId, practitionerId, availabilitySlotId, "VIDEO", 12500, "USD"],
    );
    await expectSqlState(
      client,
      'UPDATE "appointments" SET "amount_minor" = $1, "updated_at" = now() WHERE "id" = $2',
      [14000, appointmentId],
      "P0001",
    );
    await client.query(
      'INSERT INTO "payments" ("id", "appointment_id", "patient_id", "reference", "provider_code", "provider_payment_reference", "amount_minor", "currency", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
      [
        paymentId,
        appointmentId,
        patientId,
        `payment_${paymentId}`,
        "SYNTHETIC",
        `provider_${paymentId}`,
        12500,
        "USD",
      ],
    );
    await expectSqlState(
      client,
      'UPDATE "payments" SET "currency" = $1, "updated_at" = now() WHERE "id" = $2',
      ["EUR", paymentId],
      "P0001",
    );
    await client.query(
      'INSERT INTO "inbox_events" ("id", "message_id", "consumer", "event_type", "payload_hash") VALUES ($1, $2, $3, $4, $5)',
      [
        inboxEventId,
        `event_${paymentId}`,
        "payment-webhook:SYNTHETIC",
        "SUCCEEDED",
        "b".repeat(64),
      ],
    );
    await client.query(
      'INSERT INTO "payment_webhook_events" ("id", "inbox_event_id", "payment_id", "provider_code", "provider_event_id", "provider_payment_reference", "event_type", "amount_minor", "currency", "payload_hash", "signature_key_id", "provider_occurred_at", "status", "processed_at") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12, now())',
      [
        webhookEventId,
        inboxEventId,
        paymentId,
        "SYNTHETIC",
        `event_${paymentId}`,
        `provider_${paymentId}`,
        "SUCCEEDED",
        12500,
        "USD",
        "b".repeat(64),
        "synthetic-key",
        "PROCESSED",
      ],
    );
    await client.query(
      'INSERT INTO "payment_status_history" ("id", "payment_id", "webhook_event_id", "from_status", "to_status", "reason_code", "occurred_at") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [paymentHistoryId, paymentId, webhookEventId, "PENDING", "SUCCEEDED", "PROVIDER_SUCCEEDED"],
    );
    await expectSqlState(
      client,
      'DELETE FROM "payment_webhook_events" WHERE "id" = $1',
      [webhookEventId],
      "P0001",
    );
    await expectSqlState(
      client,
      'UPDATE "payment_status_history" SET "reason_code" = $1 WHERE "id" = $2',
      ["MUTATED", paymentHistoryId],
      "P0001",
    );
    await client.query("BEGIN");
    await client.query(
      'INSERT INTO "ledger_transactions" ("id", "payment_id", "event_key", "operation_type", "occurred_at") VALUES ($1, $2, $3, $4, now())',
      [ledgerTransactionId, paymentId, `settlement_${paymentId}`, "PAYMENT_SETTLEMENT"],
    );
    await client.query(
      'INSERT INTO "ledger_entries" ("id", "transaction_id", "account_code", "direction", "amount_minor", "currency") VALUES ($1, $2, $3, $4, $5, $6), ($7, $2, $8, $9, $5, $6)',
      [
        ledgerDebitId,
        ledgerTransactionId,
        "PAYMENT_PROVIDER_CLEARING",
        "DEBIT",
        12500,
        "USD",
        ledgerCreditId,
        "CUSTOMER_FUNDS_CLEARING",
        "CREDIT",
      ],
    );
    await client.query("COMMIT");
    await expectSqlState(
      client,
      'UPDATE "ledger_entries" SET "amount_minor" = $1 WHERE "id" = $2',
      [1, ledgerDebitId],
      "P0001",
    );
    await expectUnbalancedLedgerCommit(client, paymentId);
    await client.query(
      'INSERT INTO "specialty_taxonomies" ("id", "code", "name", "category", "source_system", "updated_at") VALUES ($1, $2, $3, $4, $5, now()), ($6, $7, $8, $9, $10, now())',
      [
        parentSpecialtyId,
        `parent-${parentSpecialtyId}`,
        "Synthetic Parent Specialty",
        "Synthetic",
        "MIGRATION_VERIFICATION",
        childSpecialtyId,
        `child-${childSpecialtyId}`,
        "Synthetic Child Specialty",
        "Synthetic",
        "MIGRATION_VERIFICATION",
      ],
    );
    await client.query(
      'UPDATE "specialty_taxonomies" SET "parent_id" = $1, "updated_at" = now() WHERE "id" = $2',
      [parentSpecialtyId, childSpecialtyId],
    );
    await expectSqlState(
      client,
      'UPDATE "specialty_taxonomies" SET "parent_id" = $1, "updated_at" = now() WHERE "id" = $2',
      [childSpecialtyId, parentSpecialtyId],
      "P0001",
    );
  } finally {
    await client.end();
  }
}

async function expectSqlState(
  client: pg.Client,
  sql: string,
  values: readonly unknown[],
  expectedCode: string,
): Promise<void> {
  try {
    await client.query(sql, [...values]);
  } catch (error) {
    if (isPostgresError(error) && error.code === expectedCode) return;
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${expectedCode}`);
}

async function verifyConcurrentBooking(databaseUrl: string): Promise<void> {
  const setup = new Client({ connectionString: databaseUrl });
  const first = new Client({ connectionString: databaseUrl });
  const second = new Client({ connectionString: databaseUrl });
  const principalId = v7();
  const patientId = v7();
  const practitionerId = v7();
  const feeId = v7();
  const slotId = v7();
  await Promise.all([setup.connect(), first.connect(), second.connect()]);
  try {
    await setup.query('INSERT INTO "identity_principals" ("id", "updated_at") VALUES ($1, now())', [
      principalId,
    ]);
    await setup.query(
      'INSERT INTO "patients" ("id", "principal_id", "given_name", "family_name", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [patientId, principalId, "Concurrent", "Patient"],
    );
    await setup.query(
      'INSERT INTO "practitioners" ("id", "display_name", "given_name", "family_name", "verification_status", "verified_at", "updated_at") VALUES ($1, $2, $3, $4, $5, now(), now())',
      [practitionerId, "Concurrent Practitioner", "Concurrent", "Practitioner", "VERIFIED"],
    );
    await setup.query(
      'INSERT INTO "consultation_fees" ("id", "practitioner_id", "mode", "amount_minor", "currency", "effective_from", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $7, now())',
      [feeId, practitionerId, "VIDEO", 15000, "USD", "ACTIVE", principalId],
    );
    await setup.query(
      'INSERT INTO "availability_slots" ("id", "practitioner_id", "consultation_fee_id", "starts_at", "ends_at", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, now() + interval \'7 days\', now() + interval \'7 days 30 minutes\', $4, now())',
      [slotId, practitionerId, feeId, principalId],
    );

    const attempt = async (client: pg.Client): Promise<boolean> => {
      await client.query("BEGIN");
      try {
        const claim = await client.query<{ id: string }>(
          'UPDATE "availability_slots" SET "status" = \'BOOKED\', "updated_at" = now(), "version" = "version" + 1 WHERE "id" = $1 AND "status" = \'OPEN\' RETURNING "id"',
          [slotId],
        );
        if (claim.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
        const appointmentId = v7();
        const paymentId = v7();
        await client.query(
          'INSERT INTO "appointments" ("id", "patient_id", "practitioner_id", "availability_slot_id", "mode", "starts_at", "ends_at", "amount_minor", "currency", "payment_due_at", "updated_at") SELECT $1, $2, $3, slot."id", fee."mode", slot."starts_at", slot."ends_at", fee."amount_minor", fee."currency", now() + interval \'15 minutes\', now() FROM "availability_slots" AS slot JOIN "consultation_fees" AS fee ON fee."id" = slot."consultation_fee_id" WHERE slot."id" = $4',
          [appointmentId, patientId, practitionerId, slotId],
        );
        await client.query(
          'INSERT INTO "payments" ("id", "appointment_id", "patient_id", "reference", "provider_code", "amount_minor", "currency", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
          [paymentId, appointmentId, patientId, `payment_${paymentId}`, "UNASSIGNED", 15000, "USD"],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };

    const claims = await Promise.all([attempt(first), attempt(second)]);
    if (claims.filter(Boolean).length !== 1) {
      throw new Error("Concurrent booking did not produce exactly one successful slot claim");
    }
    const result = await setup.query<{ appointments: string; payments: string }>(
      `SELECT COUNT(DISTINCT appointment."id")::text AS appointments,
              COUNT(DISTINCT payment."id")::text AS payments
         FROM "appointments" AS appointment
         LEFT JOIN "payments" AS payment ON payment."appointment_id" = appointment."id"
        WHERE appointment."availability_slot_id" = $1`,
      [slotId],
    );
    if (result.rows[0]?.appointments !== "1" || result.rows[0]?.payments !== "1") {
      throw new Error("Concurrent booking created duplicate or incomplete financial records");
    }
  } finally {
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
}

async function expectUnbalancedLedgerCommit(client: pg.Client, paymentId: string): Promise<void> {
  await client.query("BEGIN");
  try {
    const transactionId = v7();
    await client.query(
      'INSERT INTO "ledger_transactions" ("id", "payment_id", "event_key", "operation_type", "occurred_at") VALUES ($1, $2, $3, $4, now())',
      [transactionId, paymentId, `unbalanced_${transactionId}`, "PAYMENT_SETTLEMENT"],
    );
    await client.query(
      'INSERT INTO "ledger_entries" ("id", "transaction_id", "account_code", "direction", "amount_minor", "currency") VALUES ($1, $2, $3, $4, $5, $6)',
      [v7(), transactionId, "PAYMENT_PROVIDER_CLEARING", "DEBIT", 12500, "USD"],
    );
    await expectSqlState(client, "COMMIT", [], "P0001");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

function isPostgresError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

async function assertMigrationsAreTransactional(): Promise<void> {
  const migrationsRoot = join(prismaRoot, "migrations");
  const migrations = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    const sql = (await readFile(join(migrationsRoot, migration, "migration.sql"), "utf8"))
      .trim()
      .toUpperCase();
    if (!sql.startsWith("BEGIN;") || !sql.endsWith("COMMIT;")) {
      throw new Error(`${migration} must be atomic (BEGIN/COMMIT)`);
    }
  }
}

await main();
