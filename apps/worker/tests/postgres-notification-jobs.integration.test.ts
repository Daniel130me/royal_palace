import { randomBytes, randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresNotificationJobs } from "../src/notification/postgres-notification-jobs.js";
import { NotificationDeliveryWorker } from "../src/notification/notification-delivery.worker.js";
import { testConfig } from "./test-config.js";

const baseUrl = process.env.DOCUMENT_JOBS_DATABASE_URL;
const enabled = baseUrl !== undefined;
const databaseName = `rp_notification_jobs_${randomBytes(6).toString("hex")}`;

describe.skipIf(!enabled)("PostgreSQL notification delivery leasing", () => {
  let admin: Client;
  let fixture: Client;
  let jobs: PostgresNotificationJobs;
  let fixtureDatabaseUrl: string;

  beforeAll(async () => {
    if (baseUrl === undefined) throw new Error("A disposable PostgreSQL connection is required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "postgresql:" || !parsed.pathname.endsWith("royal_palace_verify")) {
      throw new Error("Notification integration requires the explicit disposable verifier URL");
    }
    const adminUrl = new URL(parsed);
    adminUrl.pathname = "/postgres";
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    parsed.pathname = `/${databaseName}`;
    fixtureDatabaseUrl = parsed.toString();
    fixture = new Client({ connectionString: parsed.toString() });
    await fixture.connect();
    await fixture.query(`
      CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');
      CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'TRANSACTIONAL', 'MARKETING');
      CREATE TYPE "NotificationDeliveryStatus" AS ENUM
        ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTERED', 'CANCELLED');
      CREATE TYPE "NotificationAttemptOutcome" AS ENUM
        ('STARTED', 'ACCEPTED', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN');
      CREATE TABLE notification_deliveries (
        id uuid PRIMARY KEY, deduplication_key text NOT NULL UNIQUE,
        recipient_principal_id uuid NOT NULL, channel "NotificationChannel" NOT NULL,
        category "NotificationCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
        template_key text NOT NULL, template_version integer NOT NULL, locale text NOT NULL,
        variables jsonb NOT NULL, status "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
        available_at timestamptz NOT NULL DEFAULT now(), attempt_count integer NOT NULL DEFAULT 0,
        lease_token uuid, lease_expires_at timestamptz, provider_code text,
        provider_message_id text, delivered_at timestamptz, last_error_code text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      );
      CREATE TABLE notification_attempts (
        id uuid PRIMARY KEY, delivery_id uuid NOT NULL REFERENCES notification_deliveries(id),
        attempt_number integer NOT NULL, outcome "NotificationAttemptOutcome" NOT NULL,
        provider_code text, provider_message_id text, error_code text,
        started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
        UNIQUE(delivery_id, attempt_number)
      );
      CREATE TABLE notification_recipient_endpoints (
        id uuid PRIMARY KEY, principal_id uuid NOT NULL, channel "NotificationChannel" NOT NULL,
        address text NOT NULL, verified_at timestamptz NOT NULL,
        invalidated_at timestamptz
      );
      CREATE TABLE notification_preferences (
        id uuid PRIMARY KEY, principal_id uuid NOT NULL, channel "NotificationChannel" NOT NULL,
        category "NotificationCategory" NOT NULL, enabled boolean NOT NULL,
        consented_at timestamptz, withdrawn_at timestamptz
      );
    `);
    jobs = new PostgresNotificationJobs({ ...testConfig, databaseUrl: parsed.toString() });
  });

  afterAll(async () => {
    if (jobs) await jobs.close();
    if (fixture) await fixture.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  });

  it("claims once, rejects a stale lease, retries, and records one accepted attempt", async () => {
    const id = randomUUID();
    await insertDelivery(id);

    const [first, competing] = await Promise.all([jobs.claim(), jobs.claim()]);
    const claim = first ?? competing;
    expect([first, competing].filter(Boolean)).toHaveLength(1);
    if (claim === null) throw new Error("Notification was not claimed");

    expect(
      await jobs.fail(claim, {
        backoffMs: 0,
        errorCode: "PROVIDER_TIMEOUT",
        outcome: "UNKNOWN",
      }),
    ).toBe(true);
    const second = await jobs.claim();
    if (second === null) throw new Error("Notification was not reclaimed");
    expect(second.attemptNumber).toBe(2);

    expect(
      await jobs.markDelivered(claim, {
        providerCode: "synthetic",
        providerMessageId: "stale-message",
      }),
    ).toBe(false);
    expect(
      await jobs.markDelivered(second, {
        providerCode: "synthetic",
        providerMessageId: "provider-message-1",
      }),
    ).toBe(true);

    const delivery = await fixture.query<{
      attempt_count: number;
      provider_message_id: string;
      status: string;
    }>(
      "SELECT status, attempt_count, provider_message_id FROM notification_deliveries WHERE id = $1",
      [id],
    );
    expect(delivery.rows[0]).toMatchObject({
      attempt_count: 2,
      provider_message_id: "provider-message-1",
      status: "DELIVERED",
    });
    const attempts = await fixture.query<{ outcome: string }>(
      "SELECT outcome FROM notification_attempts WHERE delivery_id = $1 ORDER BY attempt_number",
      [id],
    );
    expect(attempts.rows.map((row) => row.outcome)).toEqual(["UNKNOWN", "ACCEPTED"]);
  });

  it("dead-letters an exhausted crashed lease and closes its started attempt", async () => {
    const id = randomUUID();
    await fixture.query(
      `INSERT INTO notification_deliveries
         (id, deduplication_key, recipient_principal_id, channel, template_key,
          template_version, locale, variables, status, attempt_count, lease_token, lease_expires_at)
       VALUES ($1, $2, $3, 'EMAIL', 'APPLICATION_STATUS_UPDATED', 1, 'en', $4,
               'PROCESSING', 8, $5, clock_timestamp() - interval '1 second')`,
      [id, `test:${id}`, randomUUID(), { reference: "APP-2" }, randomUUID()],
    );
    await fixture.query(
      `INSERT INTO notification_attempts
         (id, delivery_id, attempt_number, outcome) VALUES ($1, $2, 8, 'STARTED')`,
      [randomUUID(), id],
    );

    expect(await jobs.deadLetterExhaustedLeases()).toBe(1);
    const result = await fixture.query<{ error_code: string; outcome: string; status: string }>(
      `SELECT delivery.status, attempt.outcome, attempt.error_code
       FROM notification_deliveries delivery
       JOIN notification_attempts attempt ON attempt.delivery_id = delivery.id
       WHERE delivery.id = $1`,
      [id],
    );
    expect(result.rows[0]).toMatchObject({
      error_code: "NOTIFICATION_LEASE_EXPIRED",
      outcome: "UNKNOWN",
      status: "DEAD_LETTERED",
    });
  });

  it("closes an abandoned attempt before reclaiming an unexhausted lease", async () => {
    const id = randomUUID();
    await fixture.query(
      `INSERT INTO notification_deliveries
         (id, deduplication_key, recipient_principal_id, channel, template_key,
          template_version, locale, variables, status, attempt_count, lease_token, lease_expires_at)
       VALUES ($1, $2, $3, 'PUSH', 'SECURITY_ALERT', 1, 'en', $4,
               'PROCESSING', 1, $5, clock_timestamp() - interval '1 second')`,
      [id, `test:${id}`, randomUUID(), { reference: "SEC-2" }, randomUUID()],
    );
    await fixture.query(
      `INSERT INTO notification_attempts
         (id, delivery_id, attempt_number, outcome) VALUES ($1, $2, 1, 'STARTED')`,
      [randomUUID(), id],
    );

    const reclaimed = await jobs.claim();
    expect(reclaimed).toMatchObject({ attemptNumber: 2, deliveryId: id });
    const attempts = await fixture.query<{ error_code: string | null; outcome: string }>(
      `SELECT outcome, error_code FROM notification_attempts
       WHERE delivery_id = $1 ORDER BY attempt_number`,
      [id],
    );
    expect(attempts.rows).toEqual([
      { error_code: "NOTIFICATION_LEASE_EXPIRED", outcome: "UNKNOWN" },
      { error_code: null, outcome: "STARTED" },
    ]);
    if (reclaimed === null) throw new Error("Notification was not reclaimed");
    await jobs.fail(reclaimed, {
      backoffMs: null,
      errorCode: "TEST_CLEANUP",
      outcome: "PERMANENT_FAILURE",
    });
  });

  it("delivers through the worker with a stable synthetic provider acknowledgement", async () => {
    const id = randomUUID();
    await insertDelivery(id);
    const worker = new NotificationDeliveryWorker({
      ...testConfig,
      databaseUrl: fixtureDatabaseUrl,
      notificationDelivery: { mode: "synthetic" },
    });
    try {
      expect(await worker.runOnce()).toBe(true);
    } finally {
      await worker.onModuleDestroy();
    }
    const delivery = await fixture.query<{
      provider_code: string;
      provider_message_id: string;
      status: string;
    }>(
      `SELECT status, provider_code, provider_message_id
       FROM notification_deliveries WHERE id = $1`,
      [id],
    );
    expect(delivery.rows[0]).toMatchObject({
      provider_code: "synthetic",
      status: "DELIVERED",
    });
    expect(delivery.rows[0]?.provider_message_id).toMatch(/^synthetic-[0-9a-f]{32}$/);
  });

  it("dead-letters a delivery when the principal has no verified email", async () => {
    const id = randomUUID();
    await fixture.query(
      `INSERT INTO notification_deliveries
         (id, deduplication_key, recipient_principal_id, channel, template_key,
          template_version, locale, variables, available_at)
       VALUES ($1, $2, $3, 'EMAIL', 'APPLICATION_STATUS_UPDATED', 1, 'en', $4,
               clock_timestamp() - interval '1 second')`,
      [id, `test:${id}`, randomUUID(), { reference: "APP-NO-EMAIL" }],
    );
    const worker = new NotificationDeliveryWorker({
      ...testConfig,
      databaseUrl: fixtureDatabaseUrl,
      notificationDelivery: { mode: "synthetic" },
    });
    try {
      expect(await worker.runOnce()).toBe(true);
    } finally {
      await worker.onModuleDestroy();
    }
    const result = await fixture.query<{ last_error_code: string; status: string }>(
      `SELECT status, last_error_code FROM notification_deliveries WHERE id = $1`,
      [id],
    );
    expect(result.rows[0]).toEqual({
      last_error_code: "NOTIFICATION_RECIPIENT_NOT_VERIFIED",
      status: "DEAD_LETTERED",
    });
  });

  async function insertDelivery(id: string): Promise<void> {
    const principalId = randomUUID();
    await fixture.query(
      `INSERT INTO notification_recipient_endpoints
         (id, principal_id, channel, address, verified_at)
       VALUES ($1, $2, 'EMAIL', $3, clock_timestamp())`,
      [randomUUID(), principalId, `recipient-${id}@example.test`],
    );
    await fixture.query(
      `INSERT INTO notification_deliveries
         (id, deduplication_key, recipient_principal_id, channel, template_key,
          template_version, locale, variables, available_at)
       VALUES ($1, $2, $3, 'EMAIL', 'APPLICATION_STATUS_UPDATED', 1, 'en', $4,
               clock_timestamp() - interval '1 second')`,
      [id, `test:${id}`, principalId, { reference: "APP-1" }],
    );
  }
});
