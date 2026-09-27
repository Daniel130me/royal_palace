import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
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
  const auditId = v7();

  await client.connect();
  try {
    await client.query(
      'INSERT INTO "identity_principals" ("id", "issuer", "subject", "updated_at") VALUES ($1, $2, $3, now())',
      [principalId, "https://verification.synthetic.invalid", "principal"],
    );
    await client.query(
      'INSERT INTO "organizations" ("id", "type", "legal_name", "display_name", "updated_at") VALUES ($1, $2, $3, $4, now())',
      [organizationId, "HOSPITAL", "Synthetic Hospital Limited", "Synthetic Hospital"],
    );
    await client.query(
      'INSERT INTO "memberships" ("id", "organization_id", "principal_id", "updated_at") VALUES ($1, $2, $3, now())',
      [membershipId, organizationId, principalId],
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
  const migrations = [
    "20260928120000_foundation_identity_and_organizations",
    "20260928121000_foundation_reliability_records",
  ];
  for (const migration of migrations) {
    const sql = (await readFile(join(prismaRoot, "migrations", migration, "migration.sql"), "utf8"))
      .trim()
      .toUpperCase();
    if (!sql.startsWith("BEGIN;") || !sql.endsWith("COMMIT;")) {
      throw new Error(`${migration} must be atomic (BEGIN/COMMIT)`);
    }
  }
}

await main();
