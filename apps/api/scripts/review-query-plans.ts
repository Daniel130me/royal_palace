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
const MANAGER_TICKET_COUNT = 2_000;
const MANAGER_EARNING_COUNT = 5_000;
const APPOINTMENT_COUNT = 5_000;

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
    const { managerProfileId, targetPaymentId, targetPractitionerId, targetSessionId } =
      await loadRepresentativeData(
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
        // PostgreSQL may prefer the unique practitioner-first index for a small
        // ordered LIMIT, or the specialty-first index for a more selective filter.
        // Both remain bounded indexed access paths for the production query shape.
        [
          "practitioner_specialties_specialty_practitioner_idx",
          "practitioner_specialties_practitioner_specialty_key",
        ],
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
        "document scan queue claim",
        `SELECT "id"
           FROM "application_documents"
          WHERE "scan_attempt_count" < 10
            AND "status" = 'QUARANTINED'
            AND "scan_available_at" <= clock_timestamp()
          ORDER BY "scan_available_at", "created_at", "id"
          LIMIT 1`,
        [],
        "application_documents_scan_queue_idx",
      ),
      await reviewPlan(
        client,
        "manager referral status cursor",
        `SELECT "application_id", "current_event_id", "updated_at"
           FROM "current_referral_attributions"
          WHERE "manager_profile_id" = $1
          ORDER BY "updated_at" DESC, "application_id" DESC
          LIMIT 50`,
        [managerProfileId],
        "current_referral_attribution_manager_updated_idx",
      ),
      await reviewPlan(
        client,
        "manager support ticket cursor",
        `SELECT "id", "status", "updated_at"
           FROM "manager_support_tickets"
          WHERE "manager_profile_id" = $1
          ORDER BY "updated_at" DESC, "id" DESC
          LIMIT 50`,
        [managerProfileId],
        "manager_support_tickets_manager_updated_idx",
      ),
      await reviewPlan(
        client,
        "manager earnings range",
        `SELECT "id", "currency", "amount_minor", "occurred_at"
           FROM "manager_earnings"
          WHERE "manager_profile_id" = $1
            AND "occurred_at" >= now() - interval '30 days'
            AND "occurred_at" < now()
          ORDER BY "occurred_at" DESC, "id" DESC
          LIMIT 50`,
        [managerProfileId],
        "manager_earnings_manager_occurred_idx",
        { forceIndexEligibility: true },
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
      await reviewPlan(
        client,
        "practitioner open availability",
        `SELECT "id", "starts_at", "ends_at", "consultation_fee_id"
           FROM "availability_slots"
          WHERE "practitioner_id" = $1
            AND "status" = 'OPEN'
            AND "starts_at" >= now()
            AND "starts_at" < now() + interval '31 days'
          ORDER BY "starts_at", "id"
          LIMIT 200`,
        [targetPractitionerId],
        "availability_slots_public_lookup_idx",
      ),
      await reviewPlan(
        client,
        "expired appointment reservation batch",
        `SELECT "id", "availability_slot_id", "payment_due_at"
           FROM "appointments"
          WHERE "status" IN ('PENDING_PAYMENT', 'PAYMENT_FAILED')
            AND "payment_due_at" <= now()
          ORDER BY "payment_due_at", "id"
          LIMIT 100`,
        [],
        "appointments_payment_timeout_idx",
      ),
      await reviewPlan(
        client,
        "patient payment status",
        `SELECT "id", "appointment_id", "amount_minor", "currency", "status", "updated_at"
           FROM "payments"
          WHERE "id" = $1`,
        [targetPaymentId],
        "payments_pkey",
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
): Promise<{
  managerProfileId: string;
  targetPaymentId: string;
  targetPractitionerId: string;
  targetSessionId: string;
}> {
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
  const applicationDocumentIds = onboardingApplicationIds.map(() => v7());
  await client.query(
    `INSERT INTO "application_documents"
       ("id", "application_id", "purpose", "original_filename",
        "declared_content_type", "declared_size_bytes", "declared_sha256",
        "storage_object_key", "status", "scan_available_at", "updated_at")
     SELECT input.document_id, input.application_id, 'PROFESSIONAL_CREDENTIAL',
            'credential.pdf', 'application/pdf', 1024, repeat('a', 64),
            'application-documents/' || input.document_id::text, 'QUARANTINED',
            now() - (input.ordinality * interval '1 second'), now()
       FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY
            AS input(document_id, application_id, ordinality)`,
    [applicationDocumentIds, onboardingApplicationIds],
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
  const managerProfileId = v7();
  const referralLinkId = v7();
  await client.query(
    'INSERT INTO "manager_profiles" ("id", "principal_id", "display_name", "updated_at") VALUES ($1, $2, $3, now())',
    [managerProfileId, principalId, "Query Plan Manager"],
  );
  await client.query(
    'INSERT INTO "referral_links" ("id", "manager_profile_id", "audience", "label", "signing_key_id", "created_by_principal_id", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, now())',
    [
      referralLinkId,
      managerProfileId,
      "PATIENT",
      "Query plan referrals",
      "query-plan-key",
      principalId,
    ],
  );
  const patientId = v7();
  const commissionPolicyId = v7();
  await client.query(
    'INSERT INTO "patients" ("id", "principal_id", "given_name", "family_name", "updated_at") VALUES ($1, $2, $3, $4, now())',
    [patientId, principalId, "Query", "Plan"],
  );
  await client.query(
    `INSERT INTO "commission_policies"
       ("id", "manager_profile_id", "activity_type", "currency", "rate_bps",
        "effective_from", "status", "created_by_principal_id", "approved_by_principal_id", "updated_at")
     VALUES ($1, $2, 'CONSULTATION', 'USD', 500, now() - interval '1 year',
             'ACTIVE', $3, $3, now())`,
    [commissionPolicyId, managerProfileId, principalId],
  );
  const settlementIds = Array.from({ length: MANAGER_EARNING_COUNT }, () => v7());
  const earningIds = Array.from({ length: MANAGER_EARNING_COUNT }, () => v7());
  await client.query(
    `INSERT INTO "patient_activity_settlements"
       ("id", "patient_id", "source_event_key", "source_type", "activity_type",
        "gross_amount_minor", "currency", "settled_at", "recorded_by_principal_id")
     SELECT input.id, $1, 'query-plan-settlement-' || input.ordinality, 'QUERY_PLAN',
            'CONSULTATION', 10000, 'USD', now() - (input.ordinality * interval '15 minutes'), $2
       FROM unnest($3::uuid[]) WITH ORDINALITY AS input(id, ordinality)`,
    [patientId, principalId, settlementIds],
  );
  await client.query(
    `INSERT INTO "manager_earnings"
       ("id", "event_key", "manager_profile_id", "settlement_id", "policy_id",
        "activity_type", "amount_minor", "currency", "entry_type", "occurred_at")
     SELECT input.earning_id, 'query-plan-earning-' || input.ordinality, $1,
            input.settlement_id, $2, 'CONSULTATION', 500, 'USD', 'EARNING',
            now() - (input.ordinality * interval '15 minutes')
       FROM unnest($3::uuid[], $4::uuid[]) WITH ORDINALITY
            AS input(earning_id, settlement_id, ordinality)`,
    [managerProfileId, commissionPolicyId, earningIds, settlementIds],
  );
  const attributionEventIds = onboardingApplicationIds.map(() => v7());
  await client.query(
    `INSERT INTO "referral_attribution_events"
       ("id", "application_id", "event_type", "referral_link_id", "manager_profile_id",
        "actor_principal_id", "reason_category", "request_id")
     SELECT input.event_id, input.application_id, 'ATTRIBUTED', $1, $2, $3,
            'QUERY_PLAN_FIXTURE', input.event_id::text
       FROM unnest($4::uuid[], $5::uuid[]) AS input(event_id, application_id)`,
    [referralLinkId, managerProfileId, principalId, attributionEventIds, onboardingApplicationIds],
  );
  await client.query(
    `INSERT INTO "current_referral_attributions"
       ("application_id", "current_event_id", "manager_profile_id", "referral_link_id", "updated_at")
     SELECT input.application_id, input.event_id, $1, $2,
            now() - (input.ordinality * interval '1 second')
       FROM unnest($3::uuid[], $4::uuid[]) WITH ORDINALITY
            AS input(application_id, event_id, ordinality)`,
    [managerProfileId, referralLinkId, onboardingApplicationIds, attributionEventIds],
  );
  const managerTicketIds = Array.from({ length: MANAGER_TICKET_COUNT }, () => v7());
  await client.query(
    `INSERT INTO "manager_support_tickets"
       ("id", "ticket_number", "manager_profile_id", "subject_display_name", "category",
        "created_by_principal_id", "updated_at")
     SELECT input.id, 'RPT-QP-' || lpad(input.ordinality::text, 8, '0'), $1,
            'Synthetic applicant', 'ONBOARDING', $2,
            now() - (input.ordinality * interval '1 second')
       FROM unnest($3::uuid[]) WITH ORDINALITY AS input(id, ordinality)`,
    [managerProfileId, principalId, managerTicketIds],
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
  const targetPractitionerId = practitionerIds[0];
  if (targetPractitionerId === undefined)
    throw new Error("Representative practitioner set is empty");
  const consultationFeeId = v7();
  const availabilitySlotIds = Array.from({ length: APPOINTMENT_COUNT }, () => v7());
  const appointmentIds = availabilitySlotIds.map(() => v7());
  const paymentIds = availabilitySlotIds.map(() => v7());
  await client.query(
    `INSERT INTO "consultation_fees"
       ("id", "practitioner_id", "mode", "amount_minor", "currency", "effective_from",
        "status", "created_by_principal_id", "approved_by_principal_id", "updated_at")
     VALUES ($1, $2, 'VIDEO', 12500, 'USD', now() - interval '1 day',
             'ACTIVE', $3, $3, now())`,
    [consultationFeeId, targetPractitionerId, principalId],
  );
  await client.query(
    `INSERT INTO "availability_slots"
       ("id", "practitioner_id", "consultation_fee_id", "starts_at", "ends_at",
        "status", "created_by_principal_id", "updated_at")
     SELECT input.id, $1, $2,
            now() + (input.ordinality * interval '1 hour'),
            now() + (input.ordinality * interval '1 hour') + interval '30 minutes',
            CASE WHEN input.ordinality <= 500 THEN 'OPEN'::"AvailabilitySlotStatus"
                 ELSE 'BOOKED'::"AvailabilitySlotStatus" END,
            $3, now()
       FROM unnest($4::uuid[]) WITH ORDINALITY AS input(id, ordinality)`,
    [targetPractitionerId, consultationFeeId, principalId, availabilitySlotIds],
  );
  const otherPractitionerIds = practitionerIds.slice(1, 101);
  const otherFeeIds = otherPractitionerIds.map(() => v7());
  await client.query(
    `INSERT INTO "consultation_fees"
       ("id", "practitioner_id", "mode", "amount_minor", "currency", "effective_from",
        "status", "created_by_principal_id", "approved_by_principal_id", "updated_at")
     SELECT input.fee_id, input.practitioner_id, 'VIDEO', 12500, 'USD', now() - interval '1 day',
            'ACTIVE', $1, $1, now()
       FROM unnest($2::uuid[], $3::uuid[]) AS input(fee_id, practitioner_id)`,
    [principalId, otherFeeIds, otherPractitionerIds],
  );
  const otherSlotIds: string[] = [];
  const otherSlotPractitionerIds: string[] = [];
  const otherSlotFeeIds: string[] = [];
  const otherSlotStarts: Date[] = [];
  const otherSlotEnds: Date[] = [];
  const scheduleBase = Date.now() + 60 * 60 * 1000;
  for (
    let practitionerIndex = 0;
    practitionerIndex < otherPractitionerIds.length;
    practitionerIndex += 1
  ) {
    const practitionerId = otherPractitionerIds[practitionerIndex];
    const feeId = otherFeeIds[practitionerIndex];
    if (practitionerId === undefined || feeId === undefined) continue;
    for (let slotIndex = 0; slotIndex < 100; slotIndex += 1) {
      const startsAt = new Date(scheduleBase + slotIndex * 60 * 60 * 1000);
      otherSlotIds.push(v7());
      otherSlotPractitionerIds.push(practitionerId);
      otherSlotFeeIds.push(feeId);
      otherSlotStarts.push(startsAt);
      otherSlotEnds.push(new Date(startsAt.getTime() + 30 * 60 * 1000));
    }
  }
  await client.query(
    `INSERT INTO "availability_slots"
       ("id", "practitioner_id", "consultation_fee_id", "starts_at", "ends_at",
        "created_by_principal_id", "updated_at")
     SELECT input.id, input.practitioner_id, input.fee_id, input.starts_at, input.ends_at, $1, now()
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::timestamptz[], $6::timestamptz[])
            AS input(id, practitioner_id, fee_id, starts_at, ends_at)`,
    [
      principalId,
      otherSlotIds,
      otherSlotPractitionerIds,
      otherSlotFeeIds,
      otherSlotStarts,
      otherSlotEnds,
    ],
  );
  await client.query(
    `INSERT INTO "appointments"
       ("id", "patient_id", "practitioner_id", "availability_slot_id", "mode", "starts_at",
        "ends_at", "amount_minor", "currency", "status", "payment_due_at", "updated_at")
     SELECT input.appointment_id, $1, $2, input.slot_id, 'VIDEO', slot."starts_at", slot."ends_at",
            12500, 'USD',
            CASE WHEN input.ordinality % 20 = 0 THEN 'PENDING_PAYMENT'::"AppointmentStatus"
                 ELSE 'CONFIRMED'::"AppointmentStatus" END,
            CASE WHEN input.ordinality % 20 = 0 THEN now() - interval '1 minute'
                 ELSE now() + interval '1 day' END,
            now()
       FROM unnest($3::uuid[], $4::uuid[]) WITH ORDINALITY
            AS input(appointment_id, slot_id, ordinality)
       JOIN "availability_slots" AS slot ON slot."id" = input.slot_id
      WHERE input.ordinality > 500`,
    [patientId, targetPractitionerId, appointmentIds, availabilitySlotIds],
  );
  await client.query(
    `INSERT INTO "payments"
       ("id", "appointment_id", "patient_id", "reference", "provider_code",
        "amount_minor", "currency", "updated_at")
     SELECT input.payment_id, input.appointment_id, $1, 'query_plan_' || input.payment_id::text,
            'UNASSIGNED', 12500, 'USD', now()
       FROM unnest($2::uuid[], $3::uuid[]) WITH ORDINALITY
            AS input(payment_id, appointment_id, ordinality)
      WHERE input.ordinality > 500`,
    [patientId, paymentIds, appointmentIds],
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
  const targetPaymentId = paymentIds[501];
  if (targetPaymentId === undefined) throw new Error("Representative payment set is empty");
  return { managerProfileId, targetPaymentId, targetPractitionerId, targetSessionId };
}

async function reviewPlan(
  client: pg.Client,
  query: string,
  sql: string,
  values: readonly unknown[],
  requiredIndex: string | readonly string[],
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
  const acceptedIndexes = typeof requiredIndex === "string" ? [requiredIndex] : requiredIndex;
  if (!acceptedIndexes.some((index) => indexes.has(index))) {
    throw new Error(
      `${query} did not use an accepted index (${acceptedIndexes.join(", ")}); observed: ${[...indexes].join(", ") || "none"}`,
    );
  }

  return {
    query,
    acceptedIndexes,
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
      managerReferralAttributions: ONBOARDING_APPLICATION_COUNT,
      managerTickets: MANAGER_TICKET_COUNT,
      managerEarnings: MANAGER_EARNING_COUNT,
      appointments: APPOINTMENT_COUNT - 500,
      applicationDocuments: ONBOARDING_APPLICATION_COUNT,
    },
  };
}

function collectIndexes(node: ExplainNode, indexes = new Set<string>()): Set<string> {
  if (node["Index Name"] !== undefined) indexes.add(node["Index Name"]);
  for (const child of node.Plans ?? []) collectIndexes(child, indexes);
  return indexes;
}

await main();
