import pg from "pg";
import { v7 } from "uuid";

import { requireDisposableDatabase } from "./database-safety.js";

const { Client } = pg;
const ORGANIZATION_COUNT = 20_000;
const AUDIT_EVENT_COUNT = 12_000;
const OUTBOX_EVENT_COUNT = 10_000;
const AUTH_SESSION_COUNT = 10_000;
const PRACTITIONER_COUNT = 12_000;
const ONBOARDING_APPLICATION_COUNT = 10_000;

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
  const externalIdentityId = v7();
  const organizationIds = Array.from({ length: ORGANIZATION_COUNT }, () => v7());
  const practitionerIds = Array.from({ length: PRACTITIONER_COUNT }, () => v7());
  const targetOrganizationId = organizationIds[0];
  if (targetOrganizationId === undefined)
    throw new Error("Representative organization set is empty");

  await client.connect();
  await client.query("BEGIN");
  try {
    const targetSessionId = await loadRepresentativeData(
      client,
      principalId,
      externalIdentityId,
      organizationIds,
      practitionerIds,
      targetOrganizationId,
    );
    await client.query("ANALYZE");

    const evidence = [
      await reviewPlan(
        client,
        "active session lookup",
        `SELECT session."id", session."principal_id", session."csrf_secret_hash"
           FROM "auth_sessions" AS session
           JOIN "identity_principals" AS principal ON principal."id" = session."principal_id"
          WHERE session."id" = $1
            AND session."status" = 'ACTIVE'
            AND session."idle_expires_at" > now()
            AND session."absolute_expires_at" > now()
            AND principal."status" = 'ACTIVE'`,
        [targetSessionId],
        "auth_sessions_pkey",
      ),
      await reviewPlan(
        client,
        "hospital discovery",
        `SELECT organization."id", organization."display_name"
           FROM "organizations" AS organization
           JOIN "organization_public_profiles" AS profile
             ON profile."organization_id" = organization."id"
            AND profile."status" = 'PUBLISHED'
          WHERE organization."type" = 'HOSPITAL'
            AND organization."status" = 'ACTIVE'
            AND organization."verification_status" = 'VERIFIED'
            AND (organization."display_name", organization."id") > ($1, $2)
          ORDER BY organization."display_name", organization."id"
          LIMIT 50`,
        ["Synthetic Hospital 000000", "00000000-0000-0000-0000-000000000000"],
        "organizations_public_discovery_idx",
      ),
      await reviewPlan(
        client,
        "hospital service filter",
        `SELECT offering."organization_id"
           FROM "organization_services" AS offering
           JOIN "service_taxonomies" AS service ON service."id" = offering."service_id"
          WHERE service."code" = 'query-plan-service-000'
            AND service."status" = 'ACTIVE'
            AND offering."status" = 'ACTIVE'
          ORDER BY offering."organization_id", offering."id"
          LIMIT 50`,
        [],
        "organization_services_service_status_org_idx",
      ),
      await reviewPlan(
        client,
        "hospital name search",
        `SELECT organization."id", organization."display_name"
           FROM "organizations" AS organization
          WHERE organization."display_name" ILIKE '%Hospital 010000%'
          ORDER BY organization."display_name", organization."id"
          LIMIT 50`,
        [],
        "organizations_display_name_trgm_idx",
        { forceIndexEligibility: true },
      ),
      await reviewPlan(
        client,
        "service name search",
        `SELECT service."id", service."name"
           FROM "service_taxonomies" AS service
          WHERE service."name" ILIKE '%plan-service-000%'
          ORDER BY service."name", service."id"
          LIMIT 50`,
        [],
        "service_taxonomies_name_trgm_idx",
        { forceIndexEligibility: true },
      ),
      await reviewPlan(
        client,
        "hospital location filter",
        `SELECT location."organization_id", location."id"
           FROM "facility_locations" AS location
          WHERE location."administrative_area" ILIKE 'Lagos'
            AND location."locality" ILIKE 'Ikeja'
            AND location."is_public" = true
            AND location."status" = 'ACTIVE'
          ORDER BY location."organization_id", location."id"
          LIMIT 50`,
        [],
        "facility_locations_region_trgm_idx",
        { forceIndexEligibility: true },
      ),
      await reviewPlan(
        client,
        "practitioner discovery",
        `SELECT practitioner."id", practitioner."display_name"
           FROM "practitioners" AS practitioner
           JOIN "practitioner_public_profiles" AS profile
             ON profile."practitioner_id" = practitioner."id"
            AND profile."status" = 'PUBLISHED'
          WHERE practitioner."verification_status" = 'VERIFIED'
            AND (practitioner."display_name", practitioner."id") > ($1, $2)
          ORDER BY practitioner."display_name", practitioner."id"
          LIMIT 50`,
        ["Synthetic Practitioner 000000", "00000000-0000-0000-0000-000000000000"],
        "practitioners_public_discovery_idx",
      ),
      await reviewPlan(
        client,
        "practitioner specialty filter",
        `SELECT link."practitioner_id"
           FROM "practitioner_specialties" AS link
           JOIN "specialty_taxonomies" AS specialty ON specialty."id" = link."specialty_id"
          WHERE specialty."code" = 'query-plan-specialty'
            AND specialty."status" = 'ACTIVE'
          ORDER BY link."practitioner_id", link."id"
          LIMIT 50`,
        [],
        "practitioner_specialties_specialty_practitioner_idx",
      ),
      await reviewPlan(
        client,
        "practitioner location filter",
        `SELECT location."practitioner_id", location."id"
           FROM "practitioner_locations" AS location
          WHERE location."administrative_area" ILIKE 'Ontario'
            AND location."locality" ILIKE 'Toronto'
            AND location."is_public" = true
            AND location."status" = 'ACTIVE'
          ORDER BY location."practitioner_id", location."id"
          LIMIT 50`,
        [],
        "practitioner_locations_region_trgm_idx",
        { forceIndexEligibility: true },
      ),
      await reviewPlan(
        client,
        "onboarding review queue",
        `SELECT "id", "kind", "status", "created_at"
           FROM "onboarding_applications"
          WHERE "status" = 'SUBMITTED'
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT 50`,
        [],
        "onboarding_applications_review_queue_idx",
      ),
      await reviewPlan(
        client,
        "applicant application history",
        `SELECT "id", "kind", "status", "created_at"
           FROM "onboarding_applications"
          WHERE "applicant_principal_id" = $1
            AND "kind" = 'PATIENT'
            AND "status" = 'REJECTED'
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT 50`,
        [principalId],
        "onboarding_applications_applicant_kind_status_created_idx",
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
  externalIdentityId: string,
  organizationIds: readonly string[],
  practitionerIds: readonly string[],
  targetOrganizationId: string,
): Promise<string> {
  await client.query('INSERT INTO "identity_principals" ("id", "updated_at") VALUES ($1, now())', [
    principalId,
  ]);
  await client.query(
    'INSERT INTO "external_identities" ("id", "principal_id", "issuer", "subject") VALUES ($1, $2, $3, $4)',
    [externalIdentityId, principalId, "https://plans.synthetic.invalid", "query-reviewer"],
  );
  const sessionIds = Array.from({ length: AUTH_SESSION_COUNT }, () => v7());
  await client.query(
    `INSERT INTO "auth_sessions" (
       "id", "principal_id", "external_identity_id", "csrf_secret_hash",
       "authenticated_at", "updated_at", "idle_expires_at", "absolute_expires_at"
     )
     SELECT input.id, $1, $2, repeat('a', 64), now(), now(),
            now() + interval '15 minutes', now() + interval '8 hours'
       FROM unnest($3::uuid[]) AS input(id)`,
    [principalId, externalIdentityId, sessionIds],
  );

  const onboardingPrincipalIds = Array.from({ length: ONBOARDING_APPLICATION_COUNT }, () => v7());
  const onboardingApplicationIds = onboardingPrincipalIds.map(() => v7());
  await client.query(
    `INSERT INTO "identity_principals" ("id", "updated_at")
     SELECT input.id, now() FROM unnest($1::uuid[]) AS input(id)`,
    [onboardingPrincipalIds],
  );
  await client.query(
    `INSERT INTO "onboarding_applications"
       ("id", "kind", "applicant_principal_id", "status", "submitted_at", "updated_at")
     SELECT input.id, 'PRACTITIONER', input.principal_id, 'SUBMITTED',
            now() - (input.ordinality * interval '1 second'), now()
       FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY
            AS input(id, principal_id, ordinality)`,
    [onboardingApplicationIds, onboardingPrincipalIds],
  );
  const rejectedApplicationIds = Array.from({ length: 500 }, () => v7());
  await client.query(
    `INSERT INTO "onboarding_applications"
       ("id", "kind", "applicant_principal_id", "status", "submitted_at",
        "decided_at", "decided_by_principal_id", "created_at", "updated_at")
     SELECT input.id, 'PATIENT', $1, 'REJECTED', now(), now(), $1,
            now() - (input.ordinality * interval '1 minute'), now()
       FROM unnest($2::uuid[]) WITH ORDINALITY AS input(id, ordinality)`,
    [principalId, rejectedApplicationIds],
  );

  const organizationTypes = organizationIds.map((_, index) =>
    index % 3 === 0 ? "HOSPITAL" : index % 3 === 1 ? "PHARMACY" : "LABORATORY",
  );
  const organizationStatuses = organizationIds.map((_, index) =>
    index % 17 === 0 ? "SUSPENDED" : "ACTIVE",
  );
  const verificationStatuses = organizationTypes.map((type) =>
    type === "HOSPITAL" ? "VERIFIED" : "PENDING",
  );
  const verifiedAt = organizationTypes.map((type) => (type === "HOSPITAL" ? new Date() : null));
  const legalNames = organizationIds.map(
    (_, index) => `Synthetic Organization ${String(index).padStart(6, "0")} Limited`,
  );
  const displayNames = organizationIds.map(
    (_, index) => `Synthetic Hospital ${String(index).padStart(6, "0")}`,
  );
  await client.query(
    `INSERT INTO "organizations"
       ("id", "type", "status", "verification_status", "verified_at", "legal_name", "display_name", "updated_at")
     SELECT input.id, input.type, input.status, input.verification_status, input.verified_at,
            input.legal_name, input.display_name, now()
       FROM unnest(
         $1::uuid[], $2::"OrganizationType"[], $3::"OrganizationStatus"[],
         $4::"VerificationStatus"[], $5::timestamptz[], $6::text[], $7::text[]
       ) AS input(id, type, status, verification_status, verified_at, legal_name, display_name)`,
    [
      organizationIds,
      organizationTypes,
      organizationStatuses,
      verificationStatuses,
      verifiedAt,
      legalNames,
      displayNames,
    ],
  );

  const hospitalIds = organizationIds.filter((_, index) => organizationTypes[index] === "HOSPITAL");
  const profileSlugs = hospitalIds.map(
    (_, index) => `synthetic-hospital-${String(index).padStart(6, "0")}`,
  );
  await client.query(
    `INSERT INTO "organization_public_profiles"
       ("organization_id", "slug", "status", "published_at", "updated_at")
     SELECT input.organization_id, input.slug, 'PUBLISHED', now(), now()
       FROM unnest($1::uuid[], $2::text[]) AS input(organization_id, slug)`,
    [hospitalIds, profileSlugs],
  );

  const locationIds = hospitalIds.map(() => v7());
  const administrativeAreas = hospitalIds.map((_, index) =>
    index % 100 === 0 ? "Lagos" : "Ontario",
  );
  const localities = hospitalIds.map((_, index) => (index % 100 === 0 ? "Ikeja" : "Toronto"));
  await client.query(
    `INSERT INTO "facility_locations"
       ("id", "organization_id", "label", "address_line_1", "locality", "administrative_area", "country_code",
        "is_primary", "is_public", "updated_at")
     SELECT input.id, input.organization_id, 'Main facility', 'Synthetic address', input.locality,
            input.administrative_area, 'ZZ', true, true, now()
       FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[])
            AS input(id, organization_id, administrative_area, locality)`,
    [locationIds, hospitalIds, administrativeAreas, localities],
  );

  const discoveryServiceIds = Array.from({ length: 50 }, () => v7());
  const discoveryServiceCodes = discoveryServiceIds.map(
    (_, index) => `query-plan-service-${String(index).padStart(3, "0")}`,
  );
  await client.query(
    `INSERT INTO "service_taxonomies" ("id", "code", "name", "category", "updated_at")
     SELECT input.id, input.code, input.code, 'Query plan fixtures', now()
       FROM unnest($1::uuid[], $2::text[]) AS input(id, code)`,
    [discoveryServiceIds, discoveryServiceCodes],
  );
  const offeringIds = hospitalIds.map(() => v7());
  const offeringServiceIds = hospitalIds.map(
    (_, index) => discoveryServiceIds[index % discoveryServiceIds.length],
  );
  await client.query(
    `INSERT INTO "organization_services"
       ("id", "organization_id", "service_id", "updated_at")
     SELECT input.id, input.organization_id, input.service_id, now()
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
            AS input(id, organization_id, service_id)`,
    [offeringIds, hospitalIds, offeringServiceIds],
  );

  const professionId = v7();
  const specialtyIds = Array.from({ length: 20 }, () => v7());
  const specialtyCodes = specialtyIds.map((_, index) =>
    index === 0 ? "query-plan-specialty" : `query-plan-specialty-${String(index).padStart(3, "0")}`,
  );
  await client.query(
    `INSERT INTO "profession_taxonomies"
       ("id", "code", "name", "source_system", "updated_at")
     VALUES ($1, 'query-plan-profession', 'Query Plan Profession', 'synthetic', now())`,
    [professionId],
  );
  await client.query(
    `INSERT INTO "specialty_taxonomies"
       ("id", "code", "name", "category", "source_system", "updated_at")
     SELECT input.id, input.code, input.code, 'Synthetic', 'synthetic', now()
       FROM unnest($1::uuid[], $2::text[]) AS input(id, code)`,
    [specialtyIds, specialtyCodes],
  );
  const practitionerDisplayNames = practitionerIds.map(
    (_, index) => `Synthetic Practitioner ${String(index).padStart(6, "0")}`,
  );
  await client.query(
    `INSERT INTO "practitioners"
       ("id", "display_name", "given_name", "family_name", "verification_status", "verified_at", "updated_at")
     SELECT input.id, input.display_name, 'Synthetic', 'Practitioner', 'VERIFIED', now(), now()
       FROM unnest($1::uuid[], $2::text[]) AS input(id, display_name)`,
    [practitionerIds, practitionerDisplayNames],
  );
  const practitionerSlugs = practitionerIds.map(
    (_, index) => `synthetic-practitioner-${String(index).padStart(6, "0")}`,
  );
  await client.query(
    `INSERT INTO "practitioner_public_profiles"
       ("practitioner_id", "slug", "status", "published_at", "updated_at")
     SELECT input.practitioner_id, input.slug, 'PUBLISHED', now(), now()
       FROM unnest($1::uuid[], $2::text[]) AS input(practitioner_id, slug)`,
    [practitionerIds, practitionerSlugs],
  );
  const practitionerSpecialtyIds = practitionerIds.map(() => v7());
  const practitionerSpecialtyTaxonomyIds = practitionerIds.map(
    (_, index) => specialtyIds[index % specialtyIds.length],
  );
  await client.query(
    `INSERT INTO "practitioner_specialties"
       ("id", "practitioner_id", "specialty_id", "is_primary")
     SELECT input.id, input.practitioner_id, input.specialty_id, true
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
            AS input(id, practitioner_id, specialty_id)`,
    [practitionerSpecialtyIds, practitionerIds, practitionerSpecialtyTaxonomyIds],
  );
  const practitionerLocationIds = practitionerIds.map(() => v7());
  const practitionerAdministrativeAreas = practitionerIds.map((_, index) =>
    index % 100 === 0 ? "Ontario" : "Zurich",
  );
  const practitionerLocalities = practitionerIds.map((_, index) =>
    index % 100 === 0 ? "Toronto" : "Zurich",
  );
  await client.query(
    `INSERT INTO "practitioner_locations"
       ("id", "practitioner_id", "label", "locality", "administrative_area", "country_code",
        "is_primary", "is_public", "updated_at")
     SELECT input.id, input.practitioner_id, 'Primary area', input.locality,
            input.administrative_area, 'ZZ', true, true, now()
       FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[])
            AS input(id, practitioner_id, administrative_area, locality)`,
    [
      practitionerLocationIds,
      practitionerIds,
      practitionerAdministrativeAreas,
      practitionerLocalities,
    ],
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

  const targetSessionId = sessionIds[0];
  if (targetSessionId === undefined) throw new Error("Representative session set is empty");
  return targetSessionId;
}

async function reviewPlan(
  client: pg.Client,
  query: string,
  sql: string,
  values: readonly unknown[],
  requiredIndex: string,
  options: { forceIndexEligibility?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (options.forceIndexEligibility === true) {
    // Small fixtures can legitimately make a sequential scan cheaper. Disabling it
    // and ordered B-tree scans for this statement proves the ILIKE operator can use
    // the intended trigram index; it is not presented as the planner's natural
    // production choice.
    await client.query("SET LOCAL enable_seqscan = off");
    await client.query("SET LOCAL enable_indexscan = off");
    await client.query("SET LOCAL enable_indexonlyscan = off");
  }
  const result = await client
    .query<{ "QUERY PLAN": ExplainDocument[] }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, [
      ...values,
    ])
    .finally(async () => {
      if (options.forceIndexEligibility === true) {
        await client.query("SET LOCAL enable_seqscan TO DEFAULT");
        await client.query("SET LOCAL enable_indexscan TO DEFAULT");
        await client.query("SET LOCAL enable_indexonlyscan TO DEFAULT");
      }
    });
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
    accessMode:
      options.forceIndexEligibility === true
        ? "forced eligibility proof; not the natural small-fixture plan"
        : "natural representative plan",
    observedIndexes: [...indexes].sort(),
    planningTimeMs: document["Planning Time"],
    executionTimeMs: document["Execution Time"],
    representativeRows: {
      auditEvents: AUDIT_EVENT_COUNT,
      authSessions: AUTH_SESSION_COUNT,
      organizations: ORGANIZATION_COUNT,
      outboxEvents: OUTBOX_EVENT_COUNT,
      practitioners: PRACTITIONER_COUNT,
    },
  };
}

function collectIndexes(node: ExplainNode, indexes = new Set<string>()): Set<string> {
  if (node["Index Name"] !== undefined) indexes.add(node["Index Name"]);
  for (const child of node.Plans ?? []) collectIndexes(child, indexes);
  return indexes;
}

await main();
