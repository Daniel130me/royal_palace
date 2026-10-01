BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "ManagerProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ReferralAudience" AS ENUM ('PATIENT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ReferralLinkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReferralAttributionEventType" AS ENUM ('ATTRIBUTED', 'CORRECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CommissionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PatientActivityType" AS ENUM ('CONSULTATION', 'HOSPITAL', 'PHARMACY', 'LABORATORY');

-- CreateEnum
CREATE TYPE "PatientActivitySettlementStatus" AS ENUM ('SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ManagerEarningEntryType" AS ENUM ('EARNING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ManagerEarningStatus" AS ENUM ('AVAILABLE', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "ManagerTicketCategory" AS ENUM ('ONBOARDING', 'ACCOUNT', 'TECHNICAL', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ManagerTicketStatus" AS ENUM ('ESCALATED', 'IN_REVIEW', 'WAITING_MANAGER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ManagerTicketNoteVisibility" AS ENUM ('MANAGER', 'INTERNAL');

-- CreateTable
CREATE TABLE "manager_profiles" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" "ManagerProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "manager_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_links" (
    "id" UUID NOT NULL,
    "manager_profile_id" UUID NOT NULL,
    "audience" "ReferralAudience" NOT NULL,
    "organization_type" "OrganizationType",
    "label" VARCHAR(120) NOT NULL,
    "signing_key_id" VARCHAR(64) NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "status" "ReferralLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_by_principal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_attribution_events" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "event_type" "ReferralAttributionEventType" NOT NULL,
    "referral_link_id" UUID,
    "manager_profile_id" UUID,
    "previous_event_id" UUID,
    "actor_principal_id" UUID NOT NULL,
    "reason_category" VARCHAR(100) NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_referral_attributions" (
    "application_id" UUID NOT NULL,
    "current_event_id" UUID NOT NULL,
    "manager_profile_id" UUID,
    "referral_link_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "current_referral_attributions_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "commission_policies" (
    "id" UUID NOT NULL,
    "manager_profile_id" UUID NOT NULL,
    "activity_type" "PatientActivityType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "minimum_gross_minor" BIGINT,
    "rate_bps" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "status" "CommissionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_principal_id" UUID NOT NULL,
    "approved_by_principal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "commission_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_activity_settlements" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "source_event_key" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "activity_type" "PatientActivityType" NOT NULL,
    "gross_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PatientActivitySettlementStatus" NOT NULL DEFAULT 'SETTLED',
    "settled_at" TIMESTAMPTZ(6) NOT NULL,
    "reversed_at" TIMESTAMPTZ(6),
    "recorded_by_principal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_activity_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_earnings" (
    "id" UUID NOT NULL,
    "event_key" VARCHAR(255) NOT NULL,
    "manager_profile_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "activity_type" "PatientActivityType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "entry_type" "ManagerEarningEntryType" NOT NULL,
    "status" "ManagerEarningStatus" NOT NULL DEFAULT 'AVAILABLE',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "reversal_of_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_support_tickets" (
    "id" UUID NOT NULL,
    "ticket_number" VARCHAR(32) NOT NULL,
    "manager_profile_id" UUID NOT NULL,
    "subject_display_name" VARCHAR(160) NOT NULL,
    "subject_reference" VARCHAR(100),
    "category" "ManagerTicketCategory" NOT NULL,
    "status" "ManagerTicketStatus" NOT NULL DEFAULT 'ESCALATED',
    "created_by_principal_id" UUID NOT NULL,
    "escalated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "manager_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_ticket_follow_ups" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_principal_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "visibility" "ManagerTicketNoteVisibility" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_ticket_follow_ups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "manager_profiles"
  ADD CONSTRAINT "manager_profiles_display_name_check" CHECK (length(btrim("display_name")) > 0),
  ADD CONSTRAINT "manager_profiles_version_check" CHECK ("version" > 0);

ALTER TABLE "referral_links"
  ADD CONSTRAINT "referral_links_label_check" CHECK (length(btrim("label")) > 0),
  ADD CONSTRAINT "referral_links_signing_key_check" CHECK (length(btrim("signing_key_id")) > 0),
  ADD CONSTRAINT "referral_links_version_check" CHECK ("token_version" > 0 AND "version" > 0),
  ADD CONSTRAINT "referral_links_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  ADD CONSTRAINT "referral_links_audience_check" CHECK (
    ("audience" = 'PATIENT' AND "organization_type" IS NULL)
    OR ("audience" = 'ORGANIZATION' AND "organization_type" IS NOT NULL)
  );

ALTER TABLE "referral_attribution_events"
  ADD CONSTRAINT "referral_attribution_events_reason_check" CHECK (length(btrim("reason_category")) > 0),
  ADD CONSTRAINT "referral_attribution_events_request_check" CHECK (length(btrim("request_id")) > 0),
  ADD CONSTRAINT "referral_attribution_events_shape_check" CHECK (
    ("event_type" = 'ATTRIBUTED' AND "previous_event_id" IS NULL AND "referral_link_id" IS NOT NULL AND "manager_profile_id" IS NOT NULL)
    OR ("event_type" = 'CORRECTED' AND "previous_event_id" IS NOT NULL AND "referral_link_id" IS NOT NULL AND "manager_profile_id" IS NOT NULL)
    OR ("event_type" = 'REMOVED' AND "previous_event_id" IS NOT NULL AND "referral_link_id" IS NULL AND "manager_profile_id" IS NULL)
  );

ALTER TABLE "current_referral_attributions"
  ADD CONSTRAINT "current_referral_attributions_shape_check" CHECK (
    ("manager_profile_id" IS NULL AND "referral_link_id" IS NULL)
    OR ("manager_profile_id" IS NOT NULL AND "referral_link_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "current_referral_attributions_version_check" CHECK ("version" > 0);

ALTER TABLE "commission_policies"
  ADD CONSTRAINT "commission_policies_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "commission_policies_minimum_check" CHECK ("minimum_gross_minor" IS NULL OR "minimum_gross_minor" >= 0),
  ADD CONSTRAINT "commission_policies_rate_check" CHECK ("rate_bps" > 0 AND "rate_bps" <= 10000),
  ADD CONSTRAINT "commission_policies_validity_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  ADD CONSTRAINT "commission_policies_approval_check" CHECK ("status" <> 'ACTIVE' OR "approved_by_principal_id" IS NOT NULL),
  ADD CONSTRAINT "commission_policies_version_check" CHECK ("version" > 0);

ALTER TABLE "patient_activity_settlements"
  ADD CONSTRAINT "patient_activity_settlements_source_check" CHECK (length(btrim("source_event_key")) > 0 AND length(btrim("source_type")) > 0),
  ADD CONSTRAINT "patient_activity_settlements_amount_check" CHECK ("gross_amount_minor" > 0),
  ADD CONSTRAINT "patient_activity_settlements_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "patient_activity_settlements_status_check" CHECK (
    ("status" = 'SETTLED' AND "reversed_at" IS NULL)
    OR ("status" = 'REVERSED' AND "reversed_at" IS NOT NULL AND "reversed_at" >= "settled_at")
  );

ALTER TABLE "manager_earnings"
  ADD CONSTRAINT "manager_earnings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "manager_earnings_shape_check" CHECK (
    ("entry_type" = 'EARNING' AND "amount_minor" > 0 AND "reversal_of_id" IS NULL)
    OR ("entry_type" = 'REVERSAL' AND "amount_minor" < 0 AND "reversal_of_id" IS NOT NULL)
  );

ALTER TABLE "manager_support_tickets"
  ADD CONSTRAINT "manager_support_tickets_name_check" CHECK (length(btrim("subject_display_name")) > 0),
  ADD CONSTRAINT "manager_support_tickets_reference_check" CHECK ("subject_reference" IS NULL OR length(btrim("subject_reference")) > 0),
  ADD CONSTRAINT "manager_support_tickets_version_check" CHECK ("version" > 0);

ALTER TABLE "manager_ticket_follow_ups"
  ADD CONSTRAINT "manager_ticket_follow_ups_body_check" CHECK (length(btrim("body")) > 0);

ALTER TABLE "commission_policies"
  ADD CONSTRAINT "commission_policies_no_active_overlap"
  EXCLUDE USING gist (
    "manager_profile_id" WITH =,
    "activity_type" WITH =,
    "currency" WITH =,
    tstzrange("effective_from", COALESCE("effective_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "manager_profiles_principal_id_key" ON "manager_profiles"("principal_id");

-- CreateIndex
CREATE INDEX "manager_profiles_status_created_id_idx" ON "manager_profiles"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "referral_links_manager_status_audience_idx" ON "referral_links"("manager_profile_id", "status", "audience", "created_at", "id");

-- CreateIndex
CREATE INDEX "referral_links_validity_idx" ON "referral_links"("status", "valid_from", "valid_until", "id");

-- CreateIndex
CREATE INDEX "referral_attribution_application_history_idx" ON "referral_attribution_events"("application_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "referral_attribution_manager_history_idx" ON "referral_attribution_events"("manager_profile_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "referral_attribution_application_previous_key" ON "referral_attribution_events"("application_id", "previous_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "current_referral_attributions_current_event_id_key" ON "current_referral_attributions"("current_event_id");

-- CreateIndex
CREATE INDEX "current_referral_attribution_manager_updated_idx" ON "current_referral_attributions"("manager_profile_id", "updated_at" DESC, "application_id");

-- CreateIndex
CREATE INDEX "commission_policies_active_scope_idx" ON "commission_policies"("manager_profile_id", "activity_type", "currency", "status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "patient_activity_settlements_source_event_key_key" ON "patient_activity_settlements"("source_event_key");

-- CreateIndex
CREATE INDEX "patient_activity_settlements_patient_status_idx" ON "patient_activity_settlements"("patient_id", "status", "settled_at", "id");

-- CreateIndex
CREATE INDEX "patient_activity_settlements_policy_lookup_idx" ON "patient_activity_settlements"("activity_type", "currency", "status", "settled_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_earnings_event_key_key" ON "manager_earnings"("event_key");

-- CreateIndex
CREATE INDEX "manager_earnings_manager_occurred_idx" ON "manager_earnings"("manager_profile_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "manager_earnings_manager_currency_report_idx" ON "manager_earnings"("manager_profile_id", "currency", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "manager_earnings_policy_idx" ON "manager_earnings"("policy_id", "occurred_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_earnings_settlement_entry_type_key" ON "manager_earnings"("settlement_id", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "manager_support_tickets_ticket_number_key" ON "manager_support_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "manager_support_tickets_manager_status_updated_idx" ON "manager_support_tickets"("manager_profile_id", "status", "updated_at" DESC, "id" DESC);

CREATE INDEX "manager_support_tickets_manager_updated_idx" ON "manager_support_tickets"("manager_profile_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "manager_support_tickets_review_queue_idx" ON "manager_support_tickets"("status", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "manager_ticket_follow_ups_ticket_visibility_idx" ON "manager_ticket_follow_ups"("ticket_id", "visibility", "created_at", "id");

-- AddForeignKey
ALTER TABLE "manager_profiles" ADD CONSTRAINT "manager_profiles_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attribution_events" ADD CONSTRAINT "referral_attribution_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attribution_events" ADD CONSTRAINT "referral_attribution_events_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attribution_events" ADD CONSTRAINT "referral_attribution_events_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attribution_events" ADD CONSTRAINT "referral_attribution_events_previous_event_id_fkey" FOREIGN KEY ("previous_event_id") REFERENCES "referral_attribution_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attribution_events" ADD CONSTRAINT "referral_attribution_events_actor_principal_id_fkey" FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_referral_attributions" ADD CONSTRAINT "current_referral_attributions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_referral_attributions" ADD CONSTRAINT "current_referral_attributions_current_event_id_fkey" FOREIGN KEY ("current_event_id") REFERENCES "referral_attribution_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_referral_attributions" ADD CONSTRAINT "current_referral_attributions_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_referral_attributions" ADD CONSTRAINT "current_referral_attributions_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_approved_by_principal_id_fkey" FOREIGN KEY ("approved_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_activity_settlements" ADD CONSTRAINT "patient_activity_settlements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_activity_settlements" ADD CONSTRAINT "patient_activity_settlements_recorded_by_principal_id_fkey" FOREIGN KEY ("recorded_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_earnings" ADD CONSTRAINT "manager_earnings_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_earnings" ADD CONSTRAINT "manager_earnings_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "patient_activity_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_earnings" ADD CONSTRAINT "manager_earnings_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "commission_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_earnings" ADD CONSTRAINT "manager_earnings_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "manager_earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_support_tickets" ADD CONSTRAINT "manager_support_tickets_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_support_tickets" ADD CONSTRAINT "manager_support_tickets_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_ticket_follow_ups" ADD CONSTRAINT "manager_ticket_follow_ups_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "manager_support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_ticket_follow_ups" ADD CONSTRAINT "manager_ticket_follow_ups_author_principal_id_fkey" FOREIGN KEY ("author_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "referral_attribution_initial_application_key"
  ON "referral_attribution_events" ("application_id")
  WHERE "event_type" = 'ATTRIBUTED';

CREATE OR REPLACE FUNCTION prevent_manager_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'manager attribution, earning, and follow-up records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "referral_attribution_events_no_update"
  BEFORE UPDATE OR DELETE ON "referral_attribution_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_manager_append_only_mutation();
CREATE TRIGGER "manager_earnings_no_update"
  BEFORE UPDATE OR DELETE ON "manager_earnings"
  FOR EACH ROW EXECUTE FUNCTION prevent_manager_append_only_mutation();
CREATE TRIGGER "manager_ticket_follow_ups_no_update"
  BEFORE UPDATE OR DELETE ON "manager_ticket_follow_ups"
  FOR EACH ROW EXECUTE FUNCTION prevent_manager_append_only_mutation();

CREATE OR REPLACE FUNCTION enforce_current_referral_attribution()
RETURNS trigger AS $$
DECLARE
  event_application_id uuid;
  event_manager_profile_id uuid;
  event_referral_link_id uuid;
BEGIN
  SELECT "application_id", "manager_profile_id", "referral_link_id"
    INTO event_application_id, event_manager_profile_id, event_referral_link_id
    FROM "referral_attribution_events"
    WHERE "id" = NEW."current_event_id";

  IF event_application_id IS NULL
    OR event_application_id <> NEW."application_id"
    OR event_manager_profile_id IS DISTINCT FROM NEW."manager_profile_id"
    OR event_referral_link_id IS DISTINCT FROM NEW."referral_link_id" THEN
    RAISE EXCEPTION 'current referral attribution must match its immutable event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "current_referral_attributions_event_consistent"
  BEFORE INSERT OR UPDATE ON "current_referral_attributions"
  FOR EACH ROW EXECUTE FUNCTION enforce_current_referral_attribution();

COMMIT;
