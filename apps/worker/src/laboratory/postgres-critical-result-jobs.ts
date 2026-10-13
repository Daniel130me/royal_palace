import type { WorkerServiceConfig } from "@royal-palace/config/environment";
import { NOTIFICATION_TEMPLATE } from "@royal-palace/contracts";
import { Pool, type PoolClient } from "pg";
import { v7 as uuidv7 } from "uuid";

const ESCALATION_BATCH_SIZE = 25;
const TEMPLATE_KEY = NOTIFICATION_TEMPLATE.LABORATORY_RESULT_ACTION_REQUIRED;

interface EscalatedCriticalResult {
  id: string;
  ownerPrincipalId: string;
  resultNumber: string;
}

export class PostgresCriticalResultJobs {
  private readonly pool: Pool;

  constructor(private readonly config: WorkerServiceConfig) {
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

  async escalateDue(): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<EscalatedCriticalResult>(
        `WITH due AS (
           SELECT id FROM laboratory_critical_results
           WHERE status = 'OPEN' AND acknowledgement_due_at <= CURRENT_TIMESTAMP
           ORDER BY acknowledgement_due_at, id
           LIMIT $1 FOR UPDATE SKIP LOCKED
         ), escalated AS (
           UPDATE laboratory_critical_results AS critical
           SET status = 'ESCALATED', escalated_at = clock_timestamp(),
               updated_at = clock_timestamp(), version = version + 1
           FROM due WHERE critical.id = due.id AND critical.status = 'OPEN'
           RETURNING critical.id, critical.result_id, critical.owner_principal_id
         )
         SELECT escalated.id, escalated.owner_principal_id AS "ownerPrincipalId",
                result.result_number AS "resultNumber"
         FROM escalated
         JOIN laboratory_results AS result ON result.id = escalated.result_id`,
        [ESCALATION_BATCH_SIZE],
      );
      for (const row of result.rows) await this.recordEscalation(client, row);
      return result.rowCount ?? 0;
    });
  }

  private async recordEscalation(
    client: PoolClient,
    critical: EscalatedCriticalResult,
  ): Promise<void> {
    let deliveryId: string | null = null;
    await client.query(
      `INSERT INTO notification_inbox_items
         (id, deduplication_key, recipient_principal_id, category, template_key,
          locale, reference, resource_type, resource_id)
       VALUES ($1::uuid, $2, $3::uuid, 'TRANSACTIONAL', $4, 'en', $5,
               'laboratory_critical_result', $6::uuid)
       ON CONFLICT (deduplication_key) DO NOTHING`,
      [
        uuidv7(),
        `inbox:laboratory-critical:${critical.id}:escalation`,
        critical.ownerPrincipalId,
        TEMPLATE_KEY,
        critical.resultNumber,
        critical.id,
      ],
    );
    if (this.config.notificationDelivery.mode !== "disabled") {
      const delivery = await client.query<{ id: string }>(
        `INSERT INTO notification_deliveries
           (id, deduplication_key, recipient_principal_id, channel, category,
            template_key, template_version, locale, variables)
         VALUES ($1::uuid, $2, $3::uuid, 'EMAIL', 'TRANSACTIONAL', $4, 1, 'en', $5::jsonb)
         ON CONFLICT (deduplication_key) DO UPDATE
           SET deduplication_key = EXCLUDED.deduplication_key
         RETURNING id`,
        [
          uuidv7(),
          `laboratory-critical:${critical.id}:escalation`,
          critical.ownerPrincipalId,
          TEMPLATE_KEY,
          JSON.stringify({ reference: critical.resultNumber }),
        ],
      );
      deliveryId = delivery.rows[0]?.id ?? null;
      if (deliveryId === null) {
        throw new Error("Critical-result escalation delivery was not persisted");
      }
    }
    await client.query(
      `INSERT INTO laboratory_critical_notifications
         (id, critical_result_id, recipient_principal_id, notification_delivery_id,
          purpose, sequence)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ESCALATION', 1)
       ON CONFLICT (critical_result_id, purpose, sequence) DO NOTHING`,
      [uuidv7(), critical.id, critical.ownerPrincipalId, deliveryId],
    );
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
