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
