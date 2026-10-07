BEGIN;

CREATE TYPE "SubstitutionApprovalMode" AS ENUM (
  'DISABLED', 'PATIENT_ONLY', 'PATIENT_AND_PRACTITIONER'
);
CREATE TYPE "SubstitutionProposalStatus" AS ENUM (
  'PROPOSED', 'PATIENT_CONSENTED', 'APPROVED', 'DECLINED', 'CANCELLED', 'USED'
);
CREATE TYPE "SubstitutionDecisionKind" AS ENUM ('PATIENT_CONSENT', 'PRACTITIONER_APPROVAL');
CREATE TYPE "SubstitutionDecisionOutcome" AS ENUM ('APPROVED', 'DECLINED');

ALTER TABLE "prescription_routes" ADD COLUMN "cancellation_reason_code" VARCHAR(100);
UPDATE "prescription_routes"
   SET "cancellation_reason_code" = 'prior_route_cancellation'
 WHERE "status" = 'CANCELLED' AND "cancellation_reason_code" IS NULL;
ALTER TABLE "prescription_routes" ADD CONSTRAINT "prescription_routes_cancellation_reason_check" CHECK (
  ("status" = 'CANCELLED' AND "cancellation_reason_code" IS NOT NULL)
  OR ("status" <> 'CANCELLED' AND "cancellation_reason_code" IS NULL)
);

CREATE TABLE "prescription_jurisdiction_policies" (
  "id" UUID PRIMARY KEY,
  "jurisdiction_code" VARCHAR(32) NOT NULL,
  "substitution_approval_mode" "SubstitutionApprovalMode" NOT NULL DEFAULT 'DISABLED',
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prescription_jurisdiction_policies_code_check" CHECK (
    "jurisdiction_code" ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'
  ),
  CONSTRAINT "prescription_jurisdiction_policies_window_check" CHECK (
    "effective_until" IS NULL OR "effective_until" > "effective_from"
  ),
  CONSTRAINT "prescription_jurisdiction_policies_version_check" CHECK ("version" > 0)
);
CREATE INDEX "prescription_jurisdiction_policies_effective_idx"
  ON "prescription_jurisdiction_policies"("jurisdiction_code", "effective_from" DESC, "id" DESC);
CREATE UNIQUE INDEX "prescription_jurisdiction_policies_one_open_window_key"
  ON "prescription_jurisdiction_policies"("jurisdiction_code")
  WHERE "effective_until" IS NULL;

CREATE OR REPLACE FUNCTION prevent_overlapping_prescription_jurisdiction_policies()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."jurisdiction_code" IS DISTINCT FROM NEW."jurisdiction_code"
       OR OLD."substitution_approval_mode" IS DISTINCT FROM NEW."substitution_approval_mode"
       OR OLD."effective_from" IS DISTINCT FROM NEW."effective_from"
       OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
       OR (OLD."effective_until" IS NOT NULL AND OLD."effective_until" IS DISTINCT FROM NEW."effective_until") THEN
      RAISE EXCEPTION 'prescription jurisdiction policy version is immutable after creation';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM "prescription_jurisdiction_policies" existing
     WHERE existing."jurisdiction_code" = NEW."jurisdiction_code"
       AND existing."id" <> NEW."id"
       AND tstzrange(existing."effective_from", existing."effective_until", '[)')
           && tstzrange(NEW."effective_from", NEW."effective_until", '[)')
  ) THEN
    RAISE EXCEPTION 'prescription jurisdiction policy effective windows cannot overlap';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_jurisdiction_policy_window_guard"
  BEFORE INSERT OR UPDATE ON "prescription_jurisdiction_policies"
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_prescription_jurisdiction_policies();

CREATE TABLE "prescription_substitution_proposals" (
  "id" UUID PRIMARY KEY,
  "prescription_id" UUID NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "prescription_item_id" UUID NOT NULL REFERENCES "prescription_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "route_id" UUID NOT NULL REFERENCES "prescription_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fill_number" INTEGER NOT NULL,
  "proposed_medication_code" VARCHAR(120),
  "proposed_medication_code_system" VARCHAR(255),
  "proposed_medication_name" VARCHAR(240) NOT NULL,
  "proposed_strength" VARCHAR(120),
  "reason_code" VARCHAR(100) NOT NULL,
  "jurisdiction_policy_id" UUID NOT NULL REFERENCES "prescription_jurisdiction_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approval_mode" "SubstitutionApprovalMode" NOT NULL,
  "status" "SubstitutionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
  "created_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prescription_substitution_proposals_fill_check" CHECK ("fill_number" BETWEEN 0 AND 99),
  CONSTRAINT "prescription_substitution_proposals_name_check" CHECK (btrim("proposed_medication_name") <> ''),
  CONSTRAINT "prescription_substitution_proposals_reason_check" CHECK ("reason_code" ~ '^[a-z][a-z0-9_]{2,99}$'),
  CONSTRAINT "prescription_substitution_proposals_mode_check" CHECK ("approval_mode" <> 'DISABLED'),
  CONSTRAINT "prescription_substitution_proposals_version_check" CHECK ("version" > 0),
  CONSTRAINT "prescription_substitution_proposals_code_shape_check" CHECK (
    ("proposed_medication_code" IS NULL AND "proposed_medication_code_system" IS NULL)
    OR (
      "proposed_medication_code" IS NOT NULL
      AND btrim("proposed_medication_code") <> ''
      AND "proposed_medication_code_system" IS NOT NULL
      AND btrim("proposed_medication_code_system") <> ''
    )
  )
);
CREATE UNIQUE INDEX "prescription_substitution_proposals_one_active_key"
  ON "prescription_substitution_proposals"("prescription_item_id", "fill_number")
  WHERE "status" IN ('PROPOSED', 'PATIENT_CONSENTED', 'APPROVED', 'USED');
CREATE INDEX "prescription_substitution_proposals_prescription_idx"
  ON "prescription_substitution_proposals"("prescription_id", "created_at", "id");
CREATE INDEX "prescription_substitution_proposals_route_status_idx"
  ON "prescription_substitution_proposals"("route_id", "status", "created_at", "id");

CREATE TABLE "prescription_substitution_decisions" (
  "id" UUID PRIMARY KEY,
  "proposal_id" UUID NOT NULL REFERENCES "prescription_substitution_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "decision_kind" "SubstitutionDecisionKind" NOT NULL,
  "outcome" "SubstitutionDecisionOutcome" NOT NULL,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_substitution_decisions_proposal_kind_key" UNIQUE ("proposal_id", "decision_kind")
);
CREATE INDEX "prescription_substitution_decisions_proposal_idx"
  ON "prescription_substitution_decisions"("proposal_id", "occurred_at", "id");

CREATE TABLE "prescription_dispense_events" (
  "id" UUID PRIMARY KEY,
  "prescription_id" UUID NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "route_id" UUID NOT NULL REFERENCES "prescription_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event_number" INTEGER NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_dispense_events_prescription_number_key" UNIQUE ("prescription_id", "event_number"),
  CONSTRAINT "prescription_dispense_events_number_check" CHECK ("event_number" > 0),
  CONSTRAINT "prescription_dispense_events_digest_check" CHECK ("request_digest" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "prescription_dispense_events_prescription_occurred_idx"
  ON "prescription_dispense_events"("prescription_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "prescription_dispense_events_route_occurred_idx"
  ON "prescription_dispense_events"("route_id", "occurred_at" DESC, "id" DESC);

CREATE TABLE "prescription_dispense_lines" (
  "id" UUID PRIMARY KEY,
  "dispense_event_id" UUID NOT NULL REFERENCES "prescription_dispense_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "prescription_item_id" UUID NOT NULL REFERENCES "prescription_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fill_number" INTEGER NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "quantity_unit" VARCHAR(64) NOT NULL,
  "substitution_proposal_id" UUID REFERENCES "prescription_substitution_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dispensed_medication_code" VARCHAR(120),
  "dispensed_medication_code_system" VARCHAR(255),
  "dispensed_medication_name" VARCHAR(240) NOT NULL,
  "dispensed_strength" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_dispense_lines_event_item_key" UNIQUE ("dispense_event_id", "prescription_item_id"),
  CONSTRAINT "prescription_dispense_lines_fill_check" CHECK ("fill_number" BETWEEN 0 AND 99),
  CONSTRAINT "prescription_dispense_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "prescription_dispense_lines_name_check" CHECK (btrim("dispensed_medication_name") <> ''),
  CONSTRAINT "prescription_dispense_lines_code_shape_check" CHECK (
    ("dispensed_medication_code" IS NULL AND "dispensed_medication_code_system" IS NULL)
    OR ("dispensed_medication_code" IS NOT NULL AND "dispensed_medication_code_system" IS NOT NULL)
  )
);
CREATE INDEX "prescription_dispense_lines_item_fill_idx"
  ON "prescription_dispense_lines"("prescription_item_id", "fill_number", "created_at", "id");
CREATE INDEX "prescription_dispense_lines_substitution_idx"
  ON "prescription_dispense_lines"("substitution_proposal_id", "created_at", "id");

CREATE OR REPLACE FUNCTION enforce_substitution_proposal_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy_mode "SubstitutionApprovalMode";
DECLARE prescription_record RECORD;
DECLARE item_record RECORD;
DECLARE route_record RECORD;
DECLARE prior_fill_dispensed NUMERIC(12,3);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."prescription_id" IS DISTINCT FROM NEW."prescription_id"
       OR OLD."prescription_item_id" IS DISTINCT FROM NEW."prescription_item_id"
       OR OLD."route_id" IS DISTINCT FROM NEW."route_id"
       OR OLD."fill_number" IS DISTINCT FROM NEW."fill_number"
       OR OLD."proposed_medication_code" IS DISTINCT FROM NEW."proposed_medication_code"
       OR OLD."proposed_medication_code_system" IS DISTINCT FROM NEW."proposed_medication_code_system"
       OR OLD."proposed_medication_name" IS DISTINCT FROM NEW."proposed_medication_name"
       OR OLD."proposed_strength" IS DISTINCT FROM NEW."proposed_strength"
       OR OLD."reason_code" IS DISTINCT FROM NEW."reason_code"
       OR OLD."jurisdiction_policy_id" IS DISTINCT FROM NEW."jurisdiction_policy_id"
       OR OLD."approval_mode" IS DISTINCT FROM NEW."approval_mode"
       OR OLD."created_by_principal_id" IS DISTINCT FROM NEW."created_by_principal_id"
       OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
      RAISE EXCEPTION 'substitution proposal clinical content is immutable';
    END IF;
    IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
    IF NOT (
      (OLD."status" = 'PROPOSED' AND NEW."status" IN ('PATIENT_CONSENTED', 'APPROVED', 'DECLINED', 'CANCELLED'))
      OR (OLD."status" = 'PATIENT_CONSENTED' AND NEW."status" IN ('APPROVED', 'DECLINED', 'CANCELLED'))
      OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('USED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'invalid substitution proposal transition from % to %', OLD."status", NEW."status";
    END IF;
    RETURN NEW;
  END IF;

  SELECT "jurisdiction_code", "status", "valid_until" INTO prescription_record
    FROM "prescriptions" WHERE "id" = NEW."prescription_id";
  SELECT "prescription_id", "medication_code", "medication_code_system", "medication_name",
         "strength", "quantity", "refills_authorized", "substitution_allowed" INTO item_record
    FROM "prescription_items" WHERE "id" = NEW."prescription_item_id";
  SELECT "prescription_id", "status" INTO route_record
    FROM "prescription_routes" WHERE "id" = NEW."route_id";
  SELECT "substitution_approval_mode" INTO policy_mode
    FROM "prescription_jurisdiction_policies"
   WHERE "id" = NEW."jurisdiction_policy_id"
     AND "jurisdiction_code" = prescription_record."jurisdiction_code"
     AND "effective_from" <= CURRENT_TIMESTAMP
     AND ("effective_until" IS NULL OR "effective_until" > CURRENT_TIMESTAMP);
  IF prescription_record IS NULL OR prescription_record."status" NOT IN ('ACCEPTED', 'PARTIALLY_DISPENSED')
     OR prescription_record."valid_until" <= CURRENT_TIMESTAMP
     OR item_record IS NULL OR item_record."prescription_id" <> NEW."prescription_id"
     OR item_record."substitution_allowed" = false OR NEW."fill_number" > item_record."refills_authorized"
     OR route_record IS NULL OR route_record."prescription_id" <> NEW."prescription_id"
     OR route_record."status" <> 'ACCEPTED'
     OR policy_mode IS NULL OR policy_mode = 'DISABLED' OR policy_mode <> NEW."approval_mode" THEN
    RAISE EXCEPTION 'substitution proposal violates prescription, route, item, or jurisdiction policy';
  END IF;
  IF lower(btrim(COALESCE(NEW."proposed_medication_code", '')))
       = lower(btrim(COALESCE(item_record."medication_code", '')))
     AND lower(btrim(COALESCE(NEW."proposed_medication_code_system", '')))
       = lower(btrim(COALESCE(item_record."medication_code_system", '')))
     AND lower(btrim(NEW."proposed_medication_name"))
       = lower(btrim(item_record."medication_name"))
     AND lower(btrim(COALESCE(NEW."proposed_strength", '')))
       = lower(btrim(COALESCE(item_record."strength", ''))) THEN
    RAISE EXCEPTION 'substitution proposal must change the medication identity';
  END IF;
  IF NEW."fill_number" > 0 THEN
    SELECT COALESCE(SUM("quantity"), 0) INTO prior_fill_dispensed
      FROM "prescription_dispense_lines"
     WHERE "prescription_item_id" = NEW."prescription_item_id"
       AND "fill_number" = NEW."fill_number" - 1;
    IF prior_fill_dispensed < item_record."quantity" THEN
      RAISE EXCEPTION 'prior prescription fill must be complete before proposing a later fill';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_substitution_proposal_scope_guard"
  BEFORE INSERT OR UPDATE ON "prescription_substitution_proposals"
  FOR EACH ROW EXECUTE FUNCTION enforce_substitution_proposal_scope();

CREATE OR REPLACE FUNCTION enforce_substitution_decision_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal_record RECORD;
DECLARE patient_principal UUID;
DECLARE practitioner_principal UUID;
BEGIN
  SELECT psp."status", psp."approval_mode", p."patient_id", p."practitioner_id",
         p."status" AS prescription_status, p."valid_until"
    INTO proposal_record
    FROM "prescription_substitution_proposals" psp
    JOIN "prescriptions" p ON p."id" = psp."prescription_id"
   WHERE psp."id" = NEW."proposal_id";
  SELECT "principal_id" INTO patient_principal FROM "patients" WHERE "id" = proposal_record."patient_id";
  SELECT "principal_id" INTO practitioner_principal FROM "practitioners" WHERE "id" = proposal_record."practitioner_id";
  IF proposal_record."prescription_status" NOT IN ('ACCEPTED', 'PARTIALLY_DISPENSED')
     OR proposal_record."valid_until" <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'substitution decision requires a current accepted prescription';
  END IF;
  IF NEW."decision_kind" = 'PATIENT_CONSENT' THEN
    IF proposal_record."status" <> 'PROPOSED' OR NEW."actor_principal_id" <> patient_principal THEN
      RAISE EXCEPTION 'patient substitution decision is not authorized for current proposal state';
    END IF;
  ELSIF proposal_record."approval_mode" <> 'PATIENT_AND_PRACTITIONER'
        OR proposal_record."status" <> 'PATIENT_CONSENTED'
        OR NEW."actor_principal_id" <> practitioner_principal THEN
    RAISE EXCEPTION 'practitioner substitution decision is not authorized for current proposal state';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_substitution_decision_scope_guard"
  BEFORE INSERT ON "prescription_substitution_decisions"
  FOR EACH ROW EXECUTE FUNCTION enforce_substitution_decision_scope();

CREATE OR REPLACE FUNCTION enforce_dispense_event_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prescription_record RECORD;
DECLARE route_record RECORD;
BEGIN
  SELECT "status", "valid_until" INTO prescription_record
    FROM "prescriptions" WHERE "id" = NEW."prescription_id";
  SELECT "prescription_id", "status" INTO route_record
    FROM "prescription_routes" WHERE "id" = NEW."route_id";
  IF prescription_record IS NULL OR prescription_record."status" NOT IN ('ACCEPTED', 'PARTIALLY_DISPENSED')
     OR prescription_record."valid_until" <= NEW."occurred_at"
     OR route_record IS NULL OR route_record."prescription_id" <> NEW."prescription_id"
     OR route_record."status" <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'dispense event requires a current accepted prescription route';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_dispense_event_scope_guard"
  BEFORE INSERT ON "prescription_dispense_events"
  FOR EACH ROW EXECUTE FUNCTION enforce_dispense_event_scope();

CREATE OR REPLACE FUNCTION enforce_dispense_line_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_record RECORD;
DECLARE item_record RECORD;
DECLARE proposal_record RECORD;
DECLARE prior_fill_remaining DECIMAL(12,3);
DECLARE dispensed_for_fill DECIMAL(12,3);
BEGIN
  SELECT "prescription_id", "route_id" INTO event_record
    FROM "prescription_dispense_events" WHERE "id" = NEW."dispense_event_id";
  SELECT * INTO item_record FROM "prescription_items" WHERE "id" = NEW."prescription_item_id";
  IF event_record IS NULL OR item_record IS NULL
     OR item_record."prescription_id" <> event_record."prescription_id"
     OR NEW."fill_number" > item_record."refills_authorized"
     OR NEW."quantity_unit" <> item_record."quantity_unit" THEN
    RAISE EXCEPTION 'dispense line violates prescription item or refill scope';
  END IF;
  IF NEW."fill_number" > 0 THEN
    SELECT item_record."quantity" - COALESCE(SUM(pdl."quantity"), 0) INTO prior_fill_remaining
      FROM "prescription_dispense_lines" pdl
     WHERE pdl."prescription_item_id" = NEW."prescription_item_id"
       AND pdl."fill_number" = NEW."fill_number" - 1;
    IF prior_fill_remaining <> 0 THEN
      RAISE EXCEPTION 'prior prescription fill is incomplete';
    END IF;
  END IF;
  SELECT COALESCE(SUM("quantity"), 0) INTO dispensed_for_fill
    FROM "prescription_dispense_lines"
   WHERE "prescription_item_id" = NEW."prescription_item_id" AND "fill_number" = NEW."fill_number";
  IF dispensed_for_fill + NEW."quantity" > item_record."quantity" THEN
    RAISE EXCEPTION 'dispense quantity exceeds authorized fill quantity';
  END IF;
  IF NEW."substitution_proposal_id" IS NULL THEN
    IF NEW."dispensed_medication_code" IS DISTINCT FROM item_record."medication_code"
       OR NEW."dispensed_medication_code_system" IS DISTINCT FROM item_record."medication_code_system"
       OR NEW."dispensed_medication_name" IS DISTINCT FROM item_record."medication_name"
       OR NEW."dispensed_strength" IS DISTINCT FROM item_record."strength" THEN
      RAISE EXCEPTION 'dispensed medication differs without an approved substitution';
    END IF;
  ELSE
    SELECT * INTO proposal_record FROM "prescription_substitution_proposals"
     WHERE "id" = NEW."substitution_proposal_id";
    IF proposal_record IS NULL OR proposal_record."prescription_item_id" <> NEW."prescription_item_id"
       OR proposal_record."route_id" <> event_record."route_id"
       OR proposal_record."fill_number" <> NEW."fill_number"
       OR proposal_record."status" NOT IN ('APPROVED', 'USED')
       OR NEW."dispensed_medication_code" IS DISTINCT FROM proposal_record."proposed_medication_code"
       OR NEW."dispensed_medication_code_system" IS DISTINCT FROM proposal_record."proposed_medication_code_system"
       OR NEW."dispensed_medication_name" IS DISTINCT FROM proposal_record."proposed_medication_name"
       OR NEW."dispensed_strength" IS DISTINCT FROM proposal_record."proposed_strength" THEN
      RAISE EXCEPTION 'dispense line substitution is not approved for this item and fill';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_dispense_line_scope_guard"
  BEFORE INSERT ON "prescription_dispense_lines"
  FOR EACH ROW EXECUTE FUNCTION enforce_dispense_line_scope();

CREATE OR REPLACE FUNCTION ensure_dispense_event_has_lines()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "prescription_dispense_lines" WHERE "dispense_event_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'dispense event must contain at least one line';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "prescription_dispense_event_lines_required"
  AFTER INSERT ON "prescription_dispense_events"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ensure_dispense_event_has_lines();

CREATE OR REPLACE FUNCTION prevent_prescription_dispense_fact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prescription dispensing facts are append-only';
END $$;
CREATE TRIGGER "prescription_substitution_decisions_no_update"
  BEFORE UPDATE OR DELETE ON "prescription_substitution_decisions"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_dispense_fact_mutation();
CREATE TRIGGER "prescription_dispense_events_no_update"
  BEFORE UPDATE OR DELETE ON "prescription_dispense_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_dispense_fact_mutation();
CREATE TRIGGER "prescription_dispense_lines_no_update"
  BEFORE UPDATE OR DELETE ON "prescription_dispense_lines"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_dispense_fact_mutation();

CREATE OR REPLACE FUNCTION enforce_prescription_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dispense_count BIGINT;
DECLARE incomplete_item_count BIGINT;
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('SIGNED', 'CANCELLED'))
    OR (OLD."status" = 'SIGNED' AND NEW."status" IN ('SENT', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'SENT' AND NEW."status" IN ('SIGNED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('SIGNED', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'PARTIALLY_DISPENSED' AND NEW."status" IN ('DISPENSED', 'CANCELLED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid prescription state transition from % to %', OLD."status", NEW."status";
  END IF;
  SELECT COUNT(*) INTO dispense_count FROM "prescription_dispense_events" WHERE "prescription_id" = OLD."id";
  IF NEW."status" = 'SIGNED' AND dispense_count <> 0 THEN
    RAISE EXCEPTION 'a prescription with dispensing facts cannot be returned for rerouting';
  END IF;
  IF NEW."status" IN ('PARTIALLY_DISPENSED', 'DISPENSED') THEN
    IF dispense_count = 0 THEN RAISE EXCEPTION 'dispense status requires an immutable dispense event'; END IF;
    SELECT COUNT(*) INTO incomplete_item_count
      FROM "prescription_items" pi
      LEFT JOIN (
        SELECT "prescription_item_id", SUM("quantity") AS dispensed
          FROM "prescription_dispense_lines" GROUP BY "prescription_item_id"
      ) totals ON totals."prescription_item_id" = pi."id"
     WHERE pi."prescription_id" = OLD."id"
       AND COALESCE(totals.dispensed, 0) < pi."quantity" * (pi."refills_authorized" + 1);
    IF NEW."status" = 'DISPENSED' AND incomplete_item_count <> 0 THEN
      RAISE EXCEPTION 'dispensed prescription requires all authorized quantities to be consumed';
    END IF;
    IF NEW."status" = 'PARTIALLY_DISPENSED' AND incomplete_item_count = 0 THEN
      RAISE EXCEPTION 'fully consumed prescription must be marked dispensed';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_prescription_fact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prescription clinical history is append-only';
END $$;
CREATE TRIGGER "prescription_substitution_proposals_no_delete"
  BEFORE DELETE ON "prescription_substitution_proposals"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_fact_mutation();

COMMIT;
