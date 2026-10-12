BEGIN;

CREATE TYPE "LaboratoryRequestPriority" AS ENUM ('ROUTINE', 'URGENT');
CREATE TYPE "LaboratoryRequestStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE "LaboratoryBookingStatus" AS ENUM (
  'CONFIRMED',
  'SAMPLE_COLLECTION_PENDING',
  'SAMPLE_COLLECTED',
  'PROCESSING',
  'RESULT_READY',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "laboratory_requests" (
  "id" UUID PRIMARY KEY,
  "request_number" VARCHAR(64) NOT NULL UNIQUE,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "appointment_id" UUID NOT NULL REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "service_id" UUID NOT NULL REFERENCES "service_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "priority" "LaboratoryRequestPriority" NOT NULL DEFAULT 'ROUTINE',
  "status" "LaboratoryRequestStatus" NOT NULL DEFAULT 'ACTIVE',
  "clinical_indication" VARCHAR(2000) NOT NULL,
  "specimen_instructions" VARCHAR(1000),
  "ordered_at" TIMESTAMPTZ(6) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "laboratory_requests_version_check" CHECK ("version" > 0),
  CONSTRAINT "laboratory_requests_number_check" CHECK (btrim("request_number") <> ''),
  CONSTRAINT "laboratory_requests_indication_check" CHECK (btrim("clinical_indication") <> ''),
  CONSTRAINT "laboratory_requests_specimen_instructions_check" CHECK (
    "specimen_instructions" IS NULL OR btrim("specimen_instructions") <> ''
  ),
  CONSTRAINT "laboratory_requests_status_shape_check" CHECK (
    ("status" = 'ACTIVE' AND "cancelled_at" IS NULL AND "completed_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
  )
);

CREATE INDEX "laboratory_requests_patient_created_idx"
  ON "laboratory_requests"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "laboratory_requests_practitioner_created_idx"
  ON "laboratory_requests"("practitioner_id", "created_at" DESC, "id" DESC);
CREATE INDEX "laboratory_requests_status_priority_ordered_idx"
  ON "laboratory_requests"("status", "priority", "ordered_at", "id");

CREATE TABLE "laboratory_request_status_history" (
  "id" UUID PRIMARY KEY,
  "request_id" UUID NOT NULL REFERENCES "laboratory_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status" "LaboratoryRequestStatus",
  "to_status" "LaboratoryRequestStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_request_history_reason_check" CHECK (
    "reason_code" ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  CONSTRAINT "laboratory_request_history_transition_check" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  )
);
CREATE INDEX "laboratory_request_history_request_idx"
  ON "laboratory_request_status_history"("request_id", "occurred_at", "id");

CREATE TABLE "laboratory_bookings" (
  "id" UUID PRIMARY KEY,
  "booking_number" VARCHAR(64) NOT NULL UNIQUE,
  "request_id" UUID NOT NULL REFERENCES "laboratory_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "laboratory_organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "LaboratoryBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "scheduled_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "sample_collected_at" TIMESTAMPTZ(6),
  "processing_started_at" TIMESTAMPTZ(6),
  "result_ready_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "laboratory_bookings_version_check" CHECK ("version" > 0),
  CONSTRAINT "laboratory_bookings_number_check" CHECK (btrim("booking_number") <> ''),
  CONSTRAINT "laboratory_bookings_schedule_check" CHECK (
    "scheduled_at" IS NULL OR "scheduled_at" >= "accepted_at"
  ),
  CONSTRAINT "laboratory_bookings_status_shape_check" CHECK (
    ("status" = 'CONFIRMED'
      AND "sample_collected_at" IS NULL AND "processing_started_at" IS NULL
      AND "result_ready_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'SAMPLE_COLLECTION_PENDING'
      AND "sample_collected_at" IS NULL AND "processing_started_at" IS NULL
      AND "result_ready_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'SAMPLE_COLLECTED'
      AND "sample_collected_at" IS NOT NULL AND "processing_started_at" IS NULL
      AND "result_ready_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'PROCESSING'
      AND "sample_collected_at" IS NOT NULL AND "processing_started_at" IS NOT NULL
      AND "result_ready_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'RESULT_READY'
      AND "sample_collected_at" IS NOT NULL AND "processing_started_at" IS NOT NULL
      AND "result_ready_at" IS NOT NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'COMPLETED'
      AND "sample_collected_at" IS NOT NULL AND "processing_started_at" IS NOT NULL
      AND "result_ready_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
  )
);

CREATE UNIQUE INDEX "laboratory_bookings_one_active_request_key"
  ON "laboratory_bookings"("request_id") WHERE "status" NOT IN ('COMPLETED', 'CANCELLED');
CREATE INDEX "laboratory_bookings_org_status_accepted_idx"
  ON "laboratory_bookings"("laboratory_organization_id", "status", "accepted_at" DESC, "id" DESC);
CREATE INDEX "laboratory_bookings_request_created_idx"
  ON "laboratory_bookings"("request_id", "created_at", "id");

CREATE TABLE "laboratory_booking_status_history" (
  "id" UUID PRIMARY KEY,
  "booking_id" UUID NOT NULL REFERENCES "laboratory_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status" "LaboratoryBookingStatus",
  "to_status" "LaboratoryBookingStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_booking_history_reason_check" CHECK (
    "reason_code" ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  CONSTRAINT "laboratory_booking_history_transition_check" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  )
);
CREATE INDEX "laboratory_booking_history_booking_idx"
  ON "laboratory_booking_status_history"("booking_id", "occurred_at", "id");

CREATE OR REPLACE FUNCTION enforce_laboratory_request_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appointment_record RECORD;
DECLARE service_status "CatalogueStatus";
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."request_number" IS DISTINCT FROM NEW."request_number"
       OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
       OR OLD."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
       OR OLD."appointment_id" IS DISTINCT FROM NEW."appointment_id"
       OR OLD."service_id" IS DISTINCT FROM NEW."service_id"
       OR OLD."priority" IS DISTINCT FROM NEW."priority"
       OR OLD."clinical_indication" IS DISTINCT FROM NEW."clinical_indication"
       OR OLD."specimen_instructions" IS DISTINCT FROM NEW."specimen_instructions"
       OR OLD."ordered_at" IS DISTINCT FROM NEW."ordered_at" THEN
      RAISE EXCEPTION 'laboratory request clinical facts are immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "patient_id", "practitioner_id", "status" INTO appointment_record
    FROM "appointments" WHERE "id" = NEW."appointment_id";
  IF appointment_record IS NULL
     OR appointment_record."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR appointment_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR appointment_record."status" NOT IN ('CONFIRMED', 'COMPLETED') THEN
    RAISE EXCEPTION 'laboratory request requires a confirmed appointment for the same patient and practitioner';
  END IF;

  SELECT "status" INTO service_status FROM "service_taxonomies" WHERE "id" = NEW."service_id";
  IF service_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'laboratory request requires an active service taxonomy entry';
  END IF;

  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_request_scope_guard"
  BEFORE INSERT OR UPDATE ON "laboratory_requests"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_request_scope();

CREATE OR REPLACE FUNCTION enforce_laboratory_request_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completed_booking_count INTEGER;
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'invalid laboratory request state transition from % to %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'COMPLETED' THEN
    SELECT 1 INTO completed_booking_count FROM "laboratory_bookings"
      WHERE "request_id" = NEW."id" AND "status" = 'COMPLETED' LIMIT 1;
    IF completed_booking_count IS NULL THEN
      RAISE EXCEPTION 'laboratory request completion requires a completed laboratory booking';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_request_transition_guard"
  BEFORE UPDATE OF "status" ON "laboratory_requests"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_request_transition();

CREATE OR REPLACE FUNCTION enforce_laboratory_booking_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE laboratory_record RECORD;
DECLARE request_status "LaboratoryRequestStatus";
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."booking_number" IS DISTINCT FROM NEW."booking_number"
    OR OLD."request_id" IS DISTINCT FROM NEW."request_id"
    OR OLD."laboratory_organization_id" IS DISTINCT FROM NEW."laboratory_organization_id"
    OR OLD."accepted_at" IS DISTINCT FROM NEW."accepted_at"
  ) THEN
    RAISE EXCEPTION 'laboratory booking identity is immutable';
  END IF;

  SELECT "type", "status", "verification_status" INTO laboratory_record
    FROM "organizations" WHERE "id" = NEW."laboratory_organization_id";
  IF laboratory_record IS NULL
     OR laboratory_record."type" <> 'LABORATORY'
     OR laboratory_record."status" <> 'ACTIVE'
     OR laboratory_record."verification_status" <> 'VERIFIED' THEN
    RAISE EXCEPTION 'laboratory booking requires an active verified laboratory';
  END IF;

  SELECT "status" INTO request_status FROM "laboratory_requests" WHERE "id" = NEW."request_id";
  IF request_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'laboratory booking requires an active laboratory request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_booking_scope_guard"
  BEFORE INSERT OR UPDATE OF "booking_number", "request_id", "laboratory_organization_id", "accepted_at"
  ON "laboratory_bookings" FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_booking_scope();

CREATE OR REPLACE FUNCTION enforce_laboratory_booking_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('SAMPLE_COLLECTION_PENDING', 'SAMPLE_COLLECTED', 'CANCELLED'))
    OR (OLD."status" = 'SAMPLE_COLLECTION_PENDING' AND NEW."status" IN ('SAMPLE_COLLECTED', 'CANCELLED'))
    OR (OLD."status" = 'SAMPLE_COLLECTED' AND NEW."status" IN ('PROCESSING', 'CANCELLED'))
    OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('RESULT_READY', 'CANCELLED'))
    OR (OLD."status" = 'RESULT_READY' AND NEW."status" = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'invalid laboratory booking state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_booking_transition_guard"
  BEFORE UPDATE OF "status" ON "laboratory_bookings"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_booking_transition();

CREATE OR REPLACE FUNCTION prevent_laboratory_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'laboratory workflow history is append-only';
END $$;
CREATE TRIGGER "laboratory_request_history_no_update"
  BEFORE UPDATE OR DELETE ON "laboratory_request_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_booking_history_no_update"
  BEFORE UPDATE OR DELETE ON "laboratory_booking_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_requests_no_delete"
  BEFORE DELETE ON "laboratory_requests"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_bookings_no_delete"
  BEFORE DELETE ON "laboratory_bookings"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();

COMMIT;
