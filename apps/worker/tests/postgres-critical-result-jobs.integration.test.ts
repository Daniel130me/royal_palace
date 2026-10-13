import { randomBytes, randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresCriticalResultJobs } from "../src/laboratory/postgres-critical-result-jobs.js";
import { testConfig } from "./test-config.js";

const baseUrl = process.env.DOCUMENT_JOBS_DATABASE_URL;
const enabled = baseUrl !== undefined;
const databaseName = `rp_critical_jobs_${randomBytes(6).toString("hex")}`;

describe.skipIf(!enabled)("PostgreSQL critical-result escalation", () => {
  let admin: Client;
  let fixture: Client;
  let first: PostgresCriticalResultJobs;
  let second: PostgresCriticalResultJobs;

  beforeAll(async () => {
    if (baseUrl === undefined) throw new Error("A disposable PostgreSQL connection is required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "postgresql:" || !parsed.pathname.endsWith("royal_palace_verify")) {
      throw new Error("Critical-result integration requires the explicit disposable verifier URL");
    }
    const adminUrl = new URL(parsed);
    adminUrl.pathname = "/postgres";
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    parsed.pathname = `/${databaseName}`;
    fixture = new Client({ connectionString: parsed.toString() });
    await fixture.connect();
    await fixture.query(`
      CREATE TYPE "LaboratoryCriticalResultStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED');
      CREATE TYPE "LaboratoryCriticalNotificationPurpose" AS ENUM ('INITIAL', 'REMINDER', 'ESCALATION');
      CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'TRANSACTIONAL', 'MARKETING');
      CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');
      CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTERED');
      CREATE TABLE laboratory_results (id uuid PRIMARY KEY, result_number varchar(64) NOT NULL);
      CREATE TABLE laboratory_critical_results (
        id uuid PRIMARY KEY, result_id uuid NOT NULL, owner_principal_id uuid NOT NULL,
        status "LaboratoryCriticalResultStatus" NOT NULL, acknowledgement_due_at timestamptz NOT NULL,
        escalated_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1
      );
      CREATE TABLE notification_inbox_items (
        id uuid PRIMARY KEY, deduplication_key varchar(200) UNIQUE NOT NULL,
        recipient_principal_id uuid, category "NotificationCategory" NOT NULL,
        template_key varchar(100) NOT NULL, locale varchar(35) NOT NULL,
        reference varchar(64) NOT NULL, resource_type varchar(100), resource_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE notification_deliveries (
        id uuid PRIMARY KEY, deduplication_key varchar(200) UNIQUE NOT NULL,
        recipient_principal_id uuid NOT NULL, channel "NotificationChannel" NOT NULL,
        category "NotificationCategory" NOT NULL, template_key varchar(100) NOT NULL,
        template_version integer NOT NULL, locale varchar(35) NOT NULL, variables jsonb NOT NULL
      );
      CREATE TABLE laboratory_critical_notifications (
        id uuid PRIMARY KEY, critical_result_id uuid NOT NULL, recipient_principal_id uuid NOT NULL,
        notification_delivery_id uuid, purpose "LaboratoryCriticalNotificationPurpose" NOT NULL,
        sequence integer NOT NULL, UNIQUE (critical_result_id, purpose, sequence)
      );
    `);
    const config = {
      ...testConfig,
      databaseUrl: parsed.toString(),
      notificationDelivery: { mode: "synthetic" as const },
    };
    first = new PostgresCriticalResultJobs(config);
    second = new PostgresCriticalResultJobs(config);
  });

  afterAll(async () => {
    if (first) await first.close();
    if (second) await second.close();
    if (fixture) await fixture.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  });

  it("escalates an overdue result exactly once across competing workers", async () => {
    const resultId = randomUUID();
    const criticalId = randomUUID();
    const ownerPrincipalId = randomUUID();
    await fixture.query("INSERT INTO laboratory_results (id, result_number) VALUES ($1, $2)", [
      resultId,
      "LABRES-TEST",
    ]);
    await fixture.query(
      `INSERT INTO laboratory_critical_results
         (id, result_id, owner_principal_id, status, acknowledgement_due_at)
       VALUES ($1, $2, $3, 'OPEN', clock_timestamp() - interval '1 second')`,
      [criticalId, resultId, ownerPrincipalId],
    );

    const counts = await Promise.all([first.escalateDue(), second.escalateDue()]);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(1);
    expect(await first.escalateDue()).toBe(0);
    const state = await fixture.query<{ status: string }>(
      "SELECT status FROM laboratory_critical_results WHERE id = $1",
      [criticalId],
    );
    expect(state.rows[0]?.status).toBe("ESCALATED");
    for (const table of [
      "notification_inbox_items",
      "notification_deliveries",
      "laboratory_critical_notifications",
    ]) {
      const count = await fixture.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${table}`,
      );
      expect(count.rows[0]?.count).toBe("1");
    }
  });
});
