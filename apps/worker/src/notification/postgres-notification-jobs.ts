import type { WorkerServiceConfig } from "@royal-palace/config/environment";
import type { NotificationCategory } from "@royal-palace/contracts";
import { Pool, type PoolClient } from "pg";
import { v7 as uuidv7 } from "uuid";

import { MAX_NOTIFICATION_ATTEMPTS, type NotificationChannel } from "./notification-policy.js";

const NOTIFICATION_LEASE_MS = 5 * 60_000;
const DEAD_LETTER_SWEEP_BATCH_SIZE = 100;

export interface NotificationJob {
  attemptId: string;
  attemptNumber: number;
  channel: NotificationChannel;
  category: NotificationCategory;
  deliveryId: string;
  destination: string | null;
  leaseToken: string;
  locale: string;
  recipientPrincipalId: string;
  recipientEligible: boolean;
  templateKey: string;
  templateVersion: number;
  variables: unknown;
}

export class PostgresNotificationJobs {
  private readonly pool: Pool;

  constructor(config: WorkerServiceConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.dependencyTimeoutMs,
      max: 2,
      options: "-c timezone=UTC",
    });
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  async claim(): Promise<NotificationJob | null> {
    const leaseToken = uuidv7();
    const attemptId = uuidv7();
    const result = await this.pool.query<NotificationJob>(
      `WITH claim AS (
         SELECT id FROM notification_deliveries
         WHERE attempt_count < $3
           AND ((status = 'PENDING' AND available_at <= clock_timestamp())
             OR (status = 'PROCESSING' AND lease_expires_at <= clock_timestamp()))
         ORDER BY available_at, created_at, id
         LIMIT 1 FOR UPDATE SKIP LOCKED
       ), updated AS (
         UPDATE notification_deliveries AS delivery
         SET status = 'PROCESSING', lease_token = $1::uuid,
             lease_expires_at = clock_timestamp() + ($2::integer * interval '1 millisecond'),
             attempt_count = attempt_count + 1, last_error_code = NULL,
             updated_at = clock_timestamp(), version = version + 1
         FROM claim WHERE delivery.id = claim.id
         RETURNING delivery.*
       ), closed_expired_attempt AS (
         UPDATE notification_attempts AS attempt
         SET outcome = 'UNKNOWN', error_code = 'NOTIFICATION_LEASE_EXPIRED',
             completed_at = clock_timestamp()
         FROM updated
         WHERE attempt.delivery_id = updated.id
           AND attempt.attempt_number = updated.attempt_count - 1
           AND attempt.outcome = 'STARTED'
         RETURNING attempt.id
       ), attempted AS (
         INSERT INTO notification_attempts
           (id, delivery_id, attempt_number, outcome, started_at)
         SELECT $4::uuid, id, attempt_count, 'STARTED', clock_timestamp() FROM updated
         RETURNING id
       )
       SELECT updated.id AS "deliveryId", attempted.id AS "attemptId",
         updated.attempt_count AS "attemptNumber", updated.channel AS "channel",
         updated.category AS "category", endpoint.address AS "destination",
         updated.lease_token AS "leaseToken", updated.locale AS "locale",
         updated.recipient_principal_id AS "recipientPrincipalId",
         CASE WHEN updated.category <> 'MARKETING' THEN true
           ELSE EXISTS (
             SELECT 1 FROM notification_preferences AS preference
             WHERE preference.principal_id = updated.recipient_principal_id
               AND preference.channel = updated.channel
               AND preference.category = 'MARKETING'
               AND preference.enabled = true
               AND preference.consented_at IS NOT NULL
               AND preference.withdrawn_at IS NULL
           ) END AS "recipientEligible",
         updated.template_key AS "templateKey", updated.template_version AS "templateVersion",
         updated.variables AS "variables"
       FROM updated CROSS JOIN attempted
       LEFT JOIN LATERAL (
         SELECT address FROM notification_recipient_endpoints
         WHERE principal_id = updated.recipient_principal_id
           AND channel = updated.channel AND invalidated_at IS NULL
         ORDER BY verified_at DESC, id
         LIMIT 1
       ) AS endpoint ON true`,
      [leaseToken, NOTIFICATION_LEASE_MS, MAX_NOTIFICATION_ATTEMPTS, attemptId],
    );
    return result.rows[0] ?? null;
  }

  async markDelivered(
    job: NotificationJob,
    result: { providerCode: string; providerMessageId: string },
  ): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const delivery = await client.query(
        `UPDATE notification_deliveries
         SET status = 'DELIVERED', provider_code = $3, provider_message_id = $4,
             delivered_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL,
             last_error_code = NULL, updated_at = clock_timestamp(), version = version + 1
         WHERE id = $1::uuid AND lease_token = $2::uuid AND status = 'PROCESSING'`,
        [job.deliveryId, job.leaseToken, result.providerCode, result.providerMessageId],
      );
      if (delivery.rowCount !== 1) return false;
      const attempt = await client.query(
        `UPDATE notification_attempts
         SET outcome = 'ACCEPTED', provider_code = $2, provider_message_id = $3,
             completed_at = clock_timestamp()
         WHERE id = $1::uuid AND outcome = 'STARTED'`,
        [job.attemptId, result.providerCode, result.providerMessageId],
      );
      if (attempt.rowCount !== 1) throw new Error("Notification attempt is unavailable");
      return true;
    });
  }

  async fail(
    job: NotificationJob,
    input: {
      backoffMs: number | null;
      errorCode: string;
      outcome: "PERMANENT_FAILURE" | "TRANSIENT_FAILURE" | "UNKNOWN";
    },
  ): Promise<boolean> {
    const deadLetter = input.backoffMs === null || input.outcome === "PERMANENT_FAILURE";
    return this.withTransaction(async (client) => {
      const delivery = await client.query(
        `UPDATE notification_deliveries
         SET status = $3::"NotificationDeliveryStatus",
             available_at = CASE WHEN $4::integer IS NULL THEN available_at
               ELSE clock_timestamp() + ($4::integer * interval '1 millisecond') END,
             lease_token = NULL, lease_expires_at = NULL, last_error_code = $5,
             updated_at = clock_timestamp(), version = version + 1
         WHERE id = $1::uuid AND lease_token = $2::uuid AND status = 'PROCESSING'`,
        [
          job.deliveryId,
          job.leaseToken,
          deadLetter ? "DEAD_LETTERED" : "PENDING",
          input.backoffMs,
          input.errorCode,
        ],
      );
      if (delivery.rowCount !== 1) return false;
      const attempt = await client.query(
        `UPDATE notification_attempts
         SET outcome = $2::"NotificationAttemptOutcome", error_code = $3,
             completed_at = clock_timestamp()
         WHERE id = $1::uuid AND outcome = 'STARTED'`,
        [job.attemptId, input.outcome, input.errorCode],
      );
      if (attempt.rowCount !== 1) throw new Error("Notification attempt is unavailable");
      return true;
    });
  }

  async deadLetterExhaustedLeases(): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<{ id: string; attemptCount: number }>(
        `WITH exhausted AS (
           SELECT id, attempt_count FROM notification_deliveries
           WHERE status = 'PROCESSING' AND lease_expires_at <= clock_timestamp()
             AND attempt_count >= $1
           ORDER BY lease_expires_at, id
           LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_deliveries AS delivery
         SET status = 'DEAD_LETTERED', lease_token = NULL, lease_expires_at = NULL,
             last_error_code = 'NOTIFICATION_RETRY_EXHAUSTED',
             updated_at = clock_timestamp(), version = version + 1
         FROM exhausted WHERE delivery.id = exhausted.id
         RETURNING delivery.id, delivery.attempt_count AS "attemptCount"`,
        [MAX_NOTIFICATION_ATTEMPTS, DEAD_LETTER_SWEEP_BATCH_SIZE],
      );
      for (const row of result.rows) {
        await client.query(
          `UPDATE notification_attempts
           SET outcome = 'UNKNOWN', error_code = 'NOTIFICATION_LEASE_EXPIRED',
               completed_at = clock_timestamp()
           WHERE delivery_id = $1::uuid AND attempt_number = $2 AND outcome = 'STARTED'`,
          [row.id, row.attemptCount],
        );
      }
      return result.rowCount ?? 0;
    });
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
