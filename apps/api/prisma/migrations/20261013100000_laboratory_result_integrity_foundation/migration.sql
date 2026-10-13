BEGIN;

CREATE TYPE "LaboratoryResultStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "LaboratoryResultFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'ABNORMAL', 'CRITICAL');
CREATE TYPE "LaboratoryCriticalResultStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED');
CREATE TYPE "LaboratoryCriticalNotificationPurpose" AS ENUM ('INITIAL', 'REMINDER', 'ESCALATION');
CREATE TYPE "LaboratoryResultAttachmentStatus" AS ENUM ('AWAITING_UPLOAD', 'QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED');

CREATE TABLE "laboratory_results" (
  "id" UUID PRIMARY KEY,
  "result_number" VARCHAR(64) NOT NULL UNIQUE,
  "booking_id" UUID NOT NULL REFERENCES "laboratory_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "laboratory_organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "previous_result_id" UUID UNIQUE REFERENCES "laboratory_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "LaboratoryResultStatus" NOT NULL DEFAULT 'DRAFT',
  "summary_flag" "LaboratoryResultFlag" NOT NULL DEFAULT 'NORMAL',
  "interpretation" VARCHAR(4000),
  "content_digest" CHAR(64),
  "created_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "verified_by_principal_id" UUID REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "published_by_principal_id" UUID REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "verified_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "laboratory_results_version_check" CHECK ("version" > 0),
  CONSTRAINT "laboratory_results_number_check" CHECK (btrim("result_number") <> ''),
  CONSTRAINT "laboratory_results_digest_check" CHECK ("content_digest" IS NULL OR "content_digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "laboratory_results_interpretation_check" CHECK ("interpretation" IS NULL OR btrim("interpretation") <> ''),
  CONSTRAINT "laboratory_results_status_shape_check" CHECK (
    ("status" = 'DRAFT' AND "verified_by_principal_id" IS NULL AND "verified_at" IS NULL AND "published_by_principal_id" IS NULL AND "published_at" IS NULL AND "superseded_at" IS NULL)
    OR ("status" = 'IN_REVIEW' AND "verified_by_principal_id" IS NULL AND "verified_at" IS NULL AND "published_by_principal_id" IS NULL AND "published_at" IS NULL AND "superseded_at" IS NULL)
    OR ("status" = 'PUBLISHED' AND "verified_by_principal_id" IS NOT NULL AND "verified_at" IS NOT NULL AND "published_by_principal_id" IS NOT NULL AND "published_at" IS NOT NULL AND "content_digest" IS NOT NULL AND "superseded_at" IS NULL)
    OR ("status" = 'SUPERSEDED' AND "verified_by_principal_id" IS NOT NULL AND "verified_at" IS NOT NULL AND "published_by_principal_id" IS NOT NULL AND "published_at" IS NOT NULL AND "content_digest" IS NOT NULL AND "superseded_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "laboratory_results_one_editable_booking_key" ON "laboratory_results"("booking_id") WHERE "status" IN ('DRAFT', 'IN_REVIEW');
CREATE UNIQUE INDEX "laboratory_results_one_current_published_booking_key" ON "laboratory_results"("booking_id") WHERE "status" = 'PUBLISHED';
CREATE INDEX "laboratory_results_patient_published_idx" ON "laboratory_results"("patient_id", "published_at" DESC, "id" DESC);
CREATE INDEX "laboratory_results_practitioner_published_idx" ON "laboratory_results"("practitioner_id", "published_at" DESC, "id" DESC);
CREATE INDEX "laboratory_results_org_status_created_idx" ON "laboratory_results"("laboratory_organization_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "laboratory_results_booking_created_idx" ON "laboratory_results"("booking_id", "created_at", "id");

CREATE TABLE "laboratory_result_components" (
  "id" UUID PRIMARY KEY,
  "result_id" UUID NOT NULL REFERENCES "laboratory_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "line_number" INTEGER NOT NULL,
  "code" VARCHAR(120),
  "code_system" VARCHAR(255),
  "name" VARCHAR(240) NOT NULL,
  "value" VARCHAR(500) NOT NULL,
  "unit" VARCHAR(120),
  "reference_range" VARCHAR(500),
  "flag" "LaboratoryResultFlag" NOT NULL DEFAULT 'NORMAL',
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_result_components_result_line_key" UNIQUE ("result_id", "line_number"),
  CONSTRAINT "laboratory_result_components_line_check" CHECK ("line_number" > 0),
  CONSTRAINT "laboratory_result_components_name_check" CHECK (btrim("name") <> ''),
  CONSTRAINT "laboratory_result_components_value_check" CHECK (btrim("value") <> ''),
  CONSTRAINT "laboratory_result_components_code_pair_check" CHECK (("code" IS NULL) = ("code_system" IS NULL))
);
CREATE INDEX "laboratory_result_components_result_flag_idx" ON "laboratory_result_components"("result_id", "flag", "id");

CREATE TABLE "laboratory_result_attachments" (
  "id" UUID PRIMARY KEY,
  "result_id" UUID NOT NULL REFERENCES "laboratory_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "purpose" VARCHAR(80) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "declared_content_type" VARCHAR(127) NOT NULL,
  "declared_size_bytes" INTEGER NOT NULL,
  "declared_sha256" CHAR(64) NOT NULL,
  "storage_object_key" VARCHAR(1024) UNIQUE,
  "upload_expires_at" TIMESTAMPTZ(6),
  "quarantine_version_id" VARCHAR(255),
  "clean_object_key" VARCHAR(1024) UNIQUE,
  "clean_version_id" VARCHAR(255),
  "detected_content_type" VARCHAR(127),
  "verified_size_bytes" INTEGER,
  "verified_sha256" CHAR(64),
  "scan_lease_token" UUID,
  "scan_lease_expires_at" TIMESTAMPTZ(6),
  "scan_available_at" TIMESTAMPTZ(6),
  "scan_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "scanned_at" TIMESTAMPTZ(6),
  "status" "LaboratoryResultAttachmentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "status_reason_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "laboratory_result_attachments_version_check" CHECK ("version" > 0),
  CONSTRAINT "laboratory_result_attachments_size_check" CHECK ("declared_size_bytes" > 0 AND ("verified_size_bytes" IS NULL OR "verified_size_bytes" > 0)),
  CONSTRAINT "laboratory_result_attachments_digest_check" CHECK ("declared_sha256" ~ '^[a-f0-9]{64}$' AND ("verified_sha256" IS NULL OR "verified_sha256" ~ '^[a-f0-9]{64}$')),
  CONSTRAINT "laboratory_result_attachments_attempt_check" CHECK ("scan_attempt_count" >= 0)
);
CREATE INDEX "laboratory_result_attachments_result_status_idx" ON "laboratory_result_attachments"("result_id", "status", "created_at", "id");
CREATE INDEX "laboratory_result_attachments_scan_queue_idx" ON "laboratory_result_attachments"("status", "scan_available_at", "id");

CREATE TABLE "laboratory_result_status_history" (
  "id" UUID PRIMARY KEY,
  "result_id" UUID NOT NULL REFERENCES "laboratory_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status" "LaboratoryResultStatus",
  "to_status" "LaboratoryResultStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_result_history_reason_check" CHECK ("reason_code" ~ '^[a-z][a-z0-9_]{2,99}$'),
  CONSTRAINT "laboratory_result_history_transition_check" CHECK ("from_status" IS NULL OR "from_status" <> "to_status")
);
CREATE INDEX "laboratory_result_history_result_idx" ON "laboratory_result_status_history"("result_id", "occurred_at", "id");

CREATE TABLE "laboratory_critical_results" (
  "id" UUID PRIMARY KEY,
  "result_id" UUID NOT NULL REFERENCES "laboratory_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "component_id" UUID NOT NULL UNIQUE REFERENCES "laboratory_result_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "owner_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "LaboratoryCriticalResultStatus" NOT NULL DEFAULT 'OPEN',
  "acknowledgement_due_at" TIMESTAMPTZ(6) NOT NULL,
  "acknowledged_by_principal_id" UUID REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "acknowledged_at" TIMESTAMPTZ(6),
  "escalated_at" TIMESTAMPTZ(6),
  "resolved_by_principal_id" UUID REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "resolved_at" TIMESTAMPTZ(6),
  "resolution_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "laboratory_critical_results_version_check" CHECK ("version" > 0),
  CONSTRAINT "laboratory_critical_results_due_check" CHECK ("acknowledgement_due_at" > "created_at"),
  CONSTRAINT "laboratory_critical_results_resolution_code_check" CHECK ("resolution_code" IS NULL OR "resolution_code" ~ '^[a-z][a-z0-9_]{2,99}$'),
  CONSTRAINT "laboratory_critical_results_status_shape_check" CHECK (
    ("status" = 'OPEN' AND "acknowledged_at" IS NULL AND "acknowledged_by_principal_id" IS NULL AND "escalated_at" IS NULL AND "resolved_at" IS NULL AND "resolved_by_principal_id" IS NULL AND "resolution_code" IS NULL)
    OR ("status" = 'ACKNOWLEDGED' AND "acknowledged_at" IS NOT NULL AND "acknowledged_by_principal_id" IS NOT NULL AND "resolved_at" IS NULL AND "resolved_by_principal_id" IS NULL AND "resolution_code" IS NULL)
    OR ("status" = 'ESCALATED' AND "escalated_at" IS NOT NULL AND "resolved_at" IS NULL AND "resolved_by_principal_id" IS NULL AND "resolution_code" IS NULL)
    OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_principal_id" IS NOT NULL AND "resolution_code" IS NOT NULL)
  )
);
CREATE INDEX "laboratory_critical_results_owner_status_due_idx" ON "laboratory_critical_results"("owner_principal_id", "status", "acknowledgement_due_at", "id");
CREATE INDEX "laboratory_critical_results_status_due_idx" ON "laboratory_critical_results"("status", "acknowledgement_due_at", "id");
CREATE INDEX "laboratory_critical_results_result_status_idx" ON "laboratory_critical_results"("result_id", "status", "id");

CREATE TABLE "laboratory_critical_notifications" (
  "id" UUID PRIMARY KEY,
  "critical_result_id" UUID NOT NULL REFERENCES "laboratory_critical_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recipient_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "notification_delivery_id" UUID UNIQUE REFERENCES "notification_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "purpose" "LaboratoryCriticalNotificationPurpose" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_critical_notifications_result_purpose_sequence_key" UNIQUE ("critical_result_id", "purpose", "sequence"),
  CONSTRAINT "laboratory_critical_notifications_sequence_check" CHECK ("sequence" > 0)
);
CREATE INDEX "laboratory_critical_notifications_result_created_idx" ON "laboratory_critical_notifications"("critical_result_id", "created_at", "id");

CREATE OR REPLACE FUNCTION enforce_laboratory_result_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE booking_record RECORD;
DECLARE previous_record RECORD;
BEGIN
  SELECT booking."request_id", booking."laboratory_organization_id", booking."status",
         request."patient_id", request."practitioner_id"
    INTO booking_record
    FROM "laboratory_bookings" booking
    JOIN "laboratory_requests" request ON request."id" = booking."request_id"
   WHERE booking."id" = NEW."booking_id";
  IF booking_record IS NULL
     OR booking_record."laboratory_organization_id" IS DISTINCT FROM NEW."laboratory_organization_id"
     OR booking_record."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR booking_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR booking_record."status" NOT IN ('PROCESSING', 'RESULT_READY', 'COMPLETED') THEN
    RAISE EXCEPTION 'laboratory result does not match an eligible booking';
  END IF;

  IF NEW."previous_result_id" IS NOT NULL THEN
    SELECT "booking_id", "status" INTO previous_record
      FROM "laboratory_results" WHERE "id" = NEW."previous_result_id";
    IF previous_record IS NULL
       OR previous_record."booking_id" IS DISTINCT FROM NEW."booking_id"
       OR previous_record."status" <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'laboratory amendment requires the current published result for the same booking';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD."result_number" IS DISTINCT FROM NEW."result_number"
    OR OLD."booking_id" IS DISTINCT FROM NEW."booking_id"
    OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
    OR OLD."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
    OR OLD."laboratory_organization_id" IS DISTINCT FROM NEW."laboratory_organization_id"
    OR OLD."previous_result_id" IS DISTINCT FROM NEW."previous_result_id"
    OR OLD."created_by_principal_id" IS DISTINCT FROM NEW."created_by_principal_id"
  ) THEN
    RAISE EXCEPTION 'laboratory result identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_result_scope_guard" BEFORE INSERT OR UPDATE ON "laboratory_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_result_scope();

CREATE OR REPLACE FUNCTION enforce_laboratory_result_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE component_count INTEGER;
DECLARE unsafe_attachment_count INTEGER;
BEGIN
  IF OLD."status" = NEW."status" THEN
    IF OLD."status" IN ('PUBLISHED', 'SUPERSEDED') AND ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
      RAISE EXCEPTION 'published laboratory results are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('DRAFT', 'PUBLISHED'))
    OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'invalid laboratory result state transition from % to %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" IN ('IN_REVIEW', 'PUBLISHED') THEN
    SELECT count(*) INTO component_count FROM "laboratory_result_components" WHERE "result_id" = NEW."id";
    SELECT count(*) INTO unsafe_attachment_count FROM "laboratory_result_attachments"
      WHERE "result_id" = NEW."id" AND "status" <> 'CLEAN';
    IF component_count = 0 THEN RAISE EXCEPTION 'laboratory result requires at least one component'; END IF;
    IF unsafe_attachment_count > 0 THEN RAISE EXCEPTION 'laboratory result attachments must be clean before review or publication'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_result_transition_guard" BEFORE UPDATE OF "status" ON "laboratory_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_result_transition();

CREATE OR REPLACE FUNCTION enforce_laboratory_component_mutability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE result_status "LaboratoryResultStatus";
BEGIN
  SELECT "status" INTO result_status FROM "laboratory_results"
   WHERE "id" = COALESCE(NEW."result_id", OLD."result_id");
  IF result_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'laboratory result components are mutable only in draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_result_component_mutability_guard" BEFORE INSERT OR UPDATE OR DELETE ON "laboratory_result_components"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_component_mutability();
CREATE TRIGGER "laboratory_result_attachment_mutability_guard" BEFORE INSERT OR UPDATE OR DELETE ON "laboratory_result_attachments"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_component_mutability();

CREATE OR REPLACE FUNCTION enforce_laboratory_critical_result_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE component_record RECORD;
DECLARE owner_id UUID;
DECLARE result_status "LaboratoryResultStatus";
BEGIN
  SELECT "result_id", "flag" INTO component_record FROM "laboratory_result_components" WHERE "id" = NEW."component_id";
  SELECT practitioner."principal_id", result."status" INTO owner_id, result_status
    FROM "laboratory_results" result
    JOIN "practitioners" practitioner ON practitioner."id" = result."practitioner_id"
   WHERE result."id" = NEW."result_id";
  IF component_record IS NULL
     OR component_record."result_id" IS DISTINCT FROM NEW."result_id"
     OR component_record."flag" <> 'CRITICAL'
     OR owner_id IS NULL
     OR owner_id IS DISTINCT FROM NEW."owner_principal_id"
     OR result_status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'critical result must reference a critical component and its ordering practitioner';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."acknowledgement_due_at" IS DISTINCT FROM NEW."acknowledgement_due_at" THEN
    RAISE EXCEPTION 'critical result acknowledgement deadline is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_critical_result_scope_guard" BEFORE INSERT OR UPDATE OF "result_id", "component_id", "owner_principal_id", "acknowledgement_due_at" ON "laboratory_critical_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_critical_result_scope();

CREATE OR REPLACE FUNCTION enforce_laboratory_critical_result_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'OPEN' AND NEW."status" IN ('ACKNOWLEDGED', 'ESCALATED'))
    OR (OLD."status" = 'ESCALATED' AND NEW."status" IN ('ACKNOWLEDGED', 'RESOLVED'))
    OR (OLD."status" = 'ACKNOWLEDGED' AND NEW."status" = 'RESOLVED')
  ) THEN
    RAISE EXCEPTION 'invalid critical laboratory result transition from % to %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'ESCALATED' AND CURRENT_TIMESTAMP < OLD."acknowledgement_due_at" THEN
    RAISE EXCEPTION 'critical laboratory result cannot escalate before its acknowledgement deadline';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "laboratory_critical_result_transition_guard" BEFORE UPDATE OF "status" ON "laboratory_critical_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_critical_result_transition();

CREATE TRIGGER "laboratory_result_history_no_update" BEFORE UPDATE OR DELETE ON "laboratory_result_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_results_no_delete" BEFORE DELETE ON "laboratory_results"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_critical_results_no_delete" BEFORE DELETE ON "laboratory_critical_results"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();
CREATE TRIGGER "laboratory_critical_notifications_no_update" BEFORE UPDATE OR DELETE ON "laboratory_critical_notifications"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_history_mutation();

COMMIT;
