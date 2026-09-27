import pg from "pg";
import { v7 } from "uuid";

import { requireDisposableDatabase } from "./database-safety.js";

const { Client } = pg;
const ORGANIZATION_COUNT = 20_000;
const AUDIT_EVENT_COUNT = 12_000;
const OUTBOX_EVENT_COUNT = 10_000;

interface ExplainNode {
  [key: string]: unknown;
  "Index Name"?: string;
  Plans?: ExplainNode[];
}

interface ExplainDocument {
  Plan: ExplainNode;
  "Planning Time": number;
  "Execution Time": number;
}

async function main(): Promise<void> {
  const databaseUrl = requireDisposableDatabase().toString();
  const client = new Client({ connectionString: databaseUrl });
  const principalId = v7();
  const organizationIds = Array.from({ length: ORGANIZATION_COUNT }, () => v7());
  const targetOrganizationId = organizationIds[0];
  if (targetOrganizationId === undefined)
    throw new Error("Representative organization set is empty");

  await client.connect();
  await client.query("BEGIN");
  try {
    await loadRepresentativeData(client, principalId, organizationIds, targetOrganizationId);
    await client.query("ANALYZE");

    const evidence = [
      await reviewPlan(
        client,
        "hospital discovery",
        `SELECT "id", "display_name"
           FROM "organizations"
          WHERE "type" = 'HOSPITAL'
            AND "status" = 'ACTIVE'
            AND ("display_name", "id") > ($1, $2)
          ORDER BY "display_name", "id"
          LIMIT 50`,
        ["Synthetic Hospital 000000", "00000000-0000-0000-0000-000000000000"],
        "organizations_type_status_name_id_idx",
      ),
      await reviewPlan(
        client,
        "organization audit cursor",
        `SELECT "id", "occurred_at", "action", "result"
           FROM "audit_events"
          WHERE "organization_id" = $1
          ORDER BY "occurred_at" DESC, "id" DESC
          LIMIT 100`,
        [targetOrganizationId],
        "audit_events_org_occurred_id_idx",
      ),
      await reviewPlan(
        client,
        "pending outbox batch",
        `SELECT "id", "event_type", "payload"
           FROM "outbox_events"
          WHERE "published_at" IS NULL AND "available_at" <= now()
          ORDER BY "available_at", "occurred_at", "id"
          LIMIT 100
          FOR UPDATE SKIP LOCKED`,
        [],
        "outbox_events_pending_available_idx",
      ),
    ];

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

async function loadRepresentativeData(
  client: pg.Client,
  principalId: string,
  organizationIds: readonly string[],
  targetOrganizationId: string,
): Promise<void> {
  await client.query(
    'INSERT INTO "identity_principals" ("id", "issuer", "subject", "updated_at") VALUES ($1, $2, $3, now())',
    [principalId, "https://plans.synthetic.invalid", "query-reviewer"],
  );

  const organizationTypes = organizationIds.map((_, index) =>
    index % 3 === 0 ? "HOSPITAL" : index % 3 === 1 ? "PHARMACY" : "LABORATORY",
  );
  const organizationStatuses = organizationIds.map((_, index) =>
    index % 17 === 0 ? "SUSPENDED" : "ACTIVE",
  );
  const legalNames = organizationIds.map(
    (_, index) => `Synthetic Organization ${String(index).padStart(6, "0")} Limited`,
  );
  const displayNames = organizationIds.map(
    (_, index) => `Synthetic Hospital ${String(index).padStart(6, "0")}`,
  );
  await client.query(
    `INSERT INTO "organizations"
       ("id", "type", "status", "legal_name", "display_name", "updated_at")
     SELECT input.id, input.type, input.status, input.legal_name, input.display_name, now()
       FROM unnest(
         $1::uuid[], $2::"OrganizationType"[], $3::"OrganizationStatus"[], $4::text[], $5::text[]
       ) AS input(id, type, status, legal_name, display_name)`,
    [organizationIds, organizationTypes, organizationStatuses, legalNames, displayNames],
  );

  const auditIds = Array.from({ length: AUDIT_EVENT_COUNT }, () => v7());
  const auditTimes = auditIds.map((_, index) => new Date(Date.now() - index * 1_000));
  await client.query(
    `INSERT INTO "audit_events"
       ("id", "occurred_at", "actor_principal_id", "action", "resource_type", "resource_id",
        "organization_id", "result", "request_id")
     SELECT input.id, input.occurred_at, $1, 'organization.read', 'organization', $2, $2,
            'SUCCEEDED', input.id::text
       FROM unnest($3::uuid[], $4::timestamptz[]) AS input(id, occurred_at)`,
    [principalId, targetOrganizationId, auditIds, auditTimes],
  );

  const outboxIds = Array.from({ length: OUTBOX_EVENT_COUNT }, () => v7());
  const aggregateIds = outboxIds.map((_, index) => organizationIds[index % organizationIds.length]);
  const availableTimes = outboxIds.map((_, index) => new Date(Date.now() - index * 100));
  await client.query(
    `INSERT INTO "outbox_events"
       ("id", "aggregate_type", "aggregate_id", "event_type", "payload", "available_at")
     SELECT input.id, 'organization', input.aggregate_id, 'organization.changed',
            jsonb_build_object('schemaVersion', 1), input.available_at
       FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[])
            AS input(id, aggregate_id, available_at)`,
    [outboxIds, aggregateIds, availableTimes],
  );
}

async function reviewPlan(
  client: pg.Client,
  query: string,
  sql: string,
  values: readonly unknown[],
  requiredIndex: string,
): Promise<Record<string, unknown>> {
  const result = await client.query<{ "QUERY PLAN": ExplainDocument[] }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    [...values],
  );
  const document = result.rows[0]?.["QUERY PLAN"]?.[0];
  if (document === undefined) throw new Error(`PostgreSQL returned no plan for ${query}`);

  const indexes = collectIndexes(document.Plan);
  if (!indexes.has(requiredIndex)) {
    throw new Error(
      `${query} did not use ${requiredIndex}; observed: ${[...indexes].join(", ") || "none"}`,
    );
  }

  return {
    query,
    requiredIndex,
    observedIndexes: [...indexes].sort(),
    planningTimeMs: document["Planning Time"],
    executionTimeMs: document["Execution Time"],
    representativeRows: {
      auditEvents: AUDIT_EVENT_COUNT,
      organizations: ORGANIZATION_COUNT,
      outboxEvents: OUTBOX_EVENT_COUNT,
    },
  };
}

function collectIndexes(node: ExplainNode, indexes = new Set<string>()): Set<string> {
  if (node["Index Name"] !== undefined) indexes.add(node["Index Name"]);
  for (const child of node.Plans ?? []) collectIndexes(child, indexes);
  return indexes;
}

await main();
