BEGIN;

CREATE TYPE "PrescriptionStatus" AS ENUM (
  'DRAFT', 'SIGNED', 'SENT', 'ACCEPTED', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED'
);
CREATE TYPE "PrescriptionRouteStatus" AS ENUM ('SENT', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "prescriptions" (
  "id" UUID PRIMARY KEY,
  "prescription_number" VARCHAR(64) NOT NULL UNIQUE,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "appointment_id" UUID NOT NULL REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "previous_prescription_id" UUID UNIQUE REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "jurisdiction_code" VARCHAR(32) NOT NULL,
  "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "clinical_note" VARCHAR(2000),
  "content_digest" CHAR(64),
  "attestation_method" VARCHAR(64),
  "signed_at" TIMESTAMPTZ(6),
  "valid_until" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "cancellation_reason_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prescriptions_number_check" CHECK (char_length("prescription_number") BETWEEN 8 AND 64),
  CONSTRAINT "prescriptions_jurisdiction_check" CHECK ("jurisdiction_code" ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  CONSTRAINT "prescriptions_version_check" CHECK ("version" > 0),
  CONSTRAINT "prescriptions_digest_check" CHECK ("content_digest" IS NULL OR "content_digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "prescriptions_attestation_shape_check" CHECK (
    ("status" = 'DRAFT' AND "content_digest" IS NULL AND "attestation_method" IS NULL
      AND "signed_at" IS NULL AND "valid_until" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "content_digest" IS NULL AND "attestation_method" IS NULL
      AND "signed_at" IS NULL AND "valid_until" IS NULL)
    OR
    ("status" <> 'DRAFT' AND "content_digest" IS NOT NULL AND "attestation_method" IS NOT NULL
      AND "signed_at" IS NOT NULL AND "valid_until" > "signed_at")
  ),
  CONSTRAINT "prescriptions_cancellation_shape_check" CHECK (
    ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancellation_reason_code" IS NOT NULL)
    OR
    ("status" <> 'CANCELLED' AND "cancelled_at" IS NULL AND "cancellation_reason_code" IS NULL)
  ),
  CONSTRAINT "prescriptions_not_self_amendment_check" CHECK ("previous_prescription_id" IS NULL OR "previous_prescription_id" <> "id")
);
CREATE INDEX "prescriptions_patient_created_idx" ON "prescriptions"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "prescriptions_practitioner_created_idx" ON "prescriptions"("practitioner_id", "created_at" DESC, "id" DESC);
CREATE INDEX "prescriptions_status_expiry_idx" ON "prescriptions"("status", "valid_until", "id");

CREATE TABLE "prescription_items" (
  "id" UUID PRIMARY KEY,
  "prescription_id" UUID NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "line_number" INTEGER NOT NULL,
  "medication_code" VARCHAR(120),
  "medication_code_system" VARCHAR(255),
  "medication_name" VARCHAR(240) NOT NULL,
  "strength" VARCHAR(120),
  "dose" VARCHAR(240) NOT NULL,
  "route" VARCHAR(120),
  "frequency" VARCHAR(240) NOT NULL,
  "duration" VARCHAR(120),
  "quantity" DECIMAL(12,3) NOT NULL,
  "quantity_unit" VARCHAR(64) NOT NULL,
  "refills_authorized" INTEGER NOT NULL DEFAULT 0,
  "substitution_allowed" BOOLEAN NOT NULL DEFAULT false,
  "controlled_medication" BOOLEAN NOT NULL DEFAULT false,
  "instructions" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_items_prescription_line_key" UNIQUE ("prescription_id", "line_number"),
  CONSTRAINT "prescription_items_line_check" CHECK ("line_number" > 0),
  CONSTRAINT "prescription_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "prescription_items_refills_check" CHECK ("refills_authorized" BETWEEN 0 AND 99),
  CONSTRAINT "prescription_items_controlled_disabled_check" CHECK ("controlled_medication" = false),
  CONSTRAINT "prescription_items_code_shape_check" CHECK (
    ("medication_code" IS NULL AND "medication_code_system" IS NULL)
    OR ("medication_code" IS NOT NULL AND "medication_code_system" IS NOT NULL)
  )
);
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id", "id");

CREATE TABLE "prescription_status_history" (
  "id" UUID PRIMARY KEY,
  "prescription_id" UUID NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status" "PrescriptionStatus",
  "to_status" "PrescriptionStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_status_history_reason_check" CHECK ("reason_code" ~ '^[a-z][a-z0-9_]{2,99}$')
);
CREATE INDEX "prescription_status_history_prescription_idx" ON "prescription_status_history"("prescription_id", "occurred_at", "id");

CREATE TABLE "prescription_routes" (
  "id" UUID PRIMARY KEY,
  "prescription_id" UUID NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pharmacy_organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "PrescriptionRouteStatus" NOT NULL DEFAULT 'SENT',
  "sent_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prescription_routes_version_check" CHECK ("version" > 0),
  CONSTRAINT "prescription_routes_status_shape_check" CHECK (
    ("status" = 'SENT' AND "accepted_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "prescription_routes_one_active_key"
  ON "prescription_routes"("prescription_id") WHERE "status" IN ('SENT', 'ACCEPTED');
CREATE INDEX "prescription_routes_pharmacy_queue_idx"
  ON "prescription_routes"("pharmacy_organization_id", "status", "sent_at" DESC, "id" DESC);
CREATE INDEX "prescription_routes_prescription_idx"
  ON "prescription_routes"("prescription_id", "created_at", "id");

CREATE OR REPLACE FUNCTION enforce_prescription_reference_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appointment_record RECORD;
DECLARE previous_record RECORD;
BEGIN
  SELECT "patient_id", "practitioner_id", "status" INTO appointment_record
    FROM "appointments" WHERE "id" = NEW."appointment_id";
  IF appointment_record IS NULL
     OR appointment_record."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR appointment_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR appointment_record."status" NOT IN ('CONFIRMED', 'COMPLETED') THEN
    RAISE EXCEPTION 'prescription appointment must belong to the same patient and practitioner';
  END IF;
  IF NEW."previous_prescription_id" IS NOT NULL THEN
    SELECT "patient_id", "practitioner_id", "status" INTO previous_record
      FROM "prescriptions" WHERE "id" = NEW."previous_prescription_id";
    IF previous_record IS NULL
       OR previous_record."patient_id" IS DISTINCT FROM NEW."patient_id"
       OR previous_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
       OR previous_record."status" = 'DRAFT' THEN
      RAISE EXCEPTION 'prescription amendment must reference a prior issued prescription';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_reference_scope_guard"
  BEFORE INSERT OR UPDATE OF "patient_id", "practitioner_id", "appointment_id", "previous_prescription_id"
  ON "prescriptions" FOR EACH ROW EXECUTE FUNCTION enforce_prescription_reference_scope();

CREATE OR REPLACE FUNCTION enforce_prescription_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('SIGNED', 'CANCELLED'))
    OR (OLD."status" = 'SIGNED' AND NEW."status" IN ('SENT', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'SENT' AND NEW."status" IN ('ACCEPTED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'PARTIALLY_DISPENSED' AND NEW."status" IN ('DISPENSED', 'CANCELLED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid prescription state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_state_transition_guard"
  BEFORE UPDATE OF "status" ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION enforce_prescription_state_transition();

CREATE OR REPLACE FUNCTION prevent_signed_prescription_content_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
    OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
    OR OLD."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
    OR OLD."appointment_id" IS DISTINCT FROM NEW."appointment_id"
    OR OLD."previous_prescription_id" IS DISTINCT FROM NEW."previous_prescription_id"
    OR OLD."jurisdiction_code" IS DISTINCT FROM NEW."jurisdiction_code"
    OR OLD."clinical_note" IS DISTINCT FROM NEW."clinical_note"
    OR OLD."content_digest" IS DISTINCT FROM NEW."content_digest"
    OR OLD."attestation_method" IS DISTINCT FROM NEW."attestation_method"
    OR OLD."signed_at" IS DISTINCT FROM NEW."signed_at"
    OR OLD."valid_until" IS DISTINCT FROM NEW."valid_until"
  ) THEN
    RAISE EXCEPTION 'signed prescription content is immutable; create an amendment';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "signed_prescription_content_immutable"
  BEFORE UPDATE ON "prescriptions" FOR EACH ROW EXECUTE FUNCTION prevent_signed_prescription_content_change();

CREATE OR REPLACE FUNCTION prevent_signed_prescription_item_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_prescription_id UUID;
DECLARE target_status "PrescriptionStatus";
BEGIN
  target_prescription_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."prescription_id" ELSE NEW."prescription_id" END;
  SELECT "status" INTO target_status FROM "prescriptions" WHERE "id" = target_prescription_id;
  IF target_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'signed prescription items are immutable; create an amendment';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "signed_prescription_items_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "prescription_items"
  FOR EACH ROW EXECUTE FUNCTION prevent_signed_prescription_item_change();

CREATE OR REPLACE FUNCTION enforce_prescription_route_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pharmacy_record RECORD;
DECLARE prescription_status "PrescriptionStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "type", "status", "verification_status" INTO pharmacy_record
      FROM "organizations" WHERE "id" = NEW."pharmacy_organization_id";
    SELECT "status" INTO prescription_status FROM "prescriptions" WHERE "id" = NEW."prescription_id";
    IF pharmacy_record IS NULL OR pharmacy_record."type" <> 'PHARMACY'
       OR pharmacy_record."status" <> 'ACTIVE' OR pharmacy_record."verification_status" <> 'VERIFIED' THEN
      RAISE EXCEPTION 'prescription route requires an active verified pharmacy';
    END IF;
    IF prescription_status <> 'SIGNED' THEN
      RAISE EXCEPTION 'only a signed prescription can be routed';
    END IF;
  ELSIF (
    OLD."prescription_id" IS DISTINCT FROM NEW."prescription_id"
    OR OLD."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
    OR OLD."sent_at" IS DISTINCT FROM NEW."sent_at"
  ) THEN
    RAISE EXCEPTION 'prescription route identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_route_scope_guard"
  BEFORE INSERT OR UPDATE ON "prescription_routes"
  FOR EACH ROW EXECUTE FUNCTION enforce_prescription_route_scope();

CREATE OR REPLACE FUNCTION enforce_prescription_route_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (OLD."status" = 'SENT' AND NEW."status" IN ('ACCEPTED', 'CANCELLED'))
     AND NOT (OLD."status" = 'ACCEPTED' AND NEW."status" = 'CANCELLED') THEN
    RAISE EXCEPTION 'invalid prescription route state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "prescription_route_transition_guard"
  BEFORE UPDATE OF "status" ON "prescription_routes"
  FOR EACH ROW EXECUTE FUNCTION enforce_prescription_route_transition();

CREATE OR REPLACE FUNCTION prevent_prescription_fact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prescription clinical history is append-only';
END $$;
CREATE TRIGGER "prescription_status_history_no_update"
  BEFORE UPDATE OR DELETE ON "prescription_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_fact_mutation();
CREATE TRIGGER "prescriptions_no_delete"
  BEFORE DELETE ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION prevent_prescription_fact_mutation();
COMMIT;
