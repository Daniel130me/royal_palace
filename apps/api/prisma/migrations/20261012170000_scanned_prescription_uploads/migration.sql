CREATE TYPE "ScannedPrescriptionStatus" AS ENUM (
  'AWAITING_UPLOAD',
  'QUARANTINED',
  'SCANNING',
  'CLEAN',
  'UNDER_REVIEW',
  'MORE_INFORMATION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'SCAN_FAILED',
  'WITHDRAWN'
);

CREATE TABLE "scanned_prescriptions" (
  "id" UUID NOT NULL,
  "upload_number" VARCHAR(48) NOT NULL,
  "patient_id" UUID NOT NULL,
  "pharmacy_organization_id" UUID,
  "prescriber_name" VARCHAR(200),
  "prescriber_facility" VARCHAR(200),
  "patient_note" VARCHAR(1000),
  "original_filename" VARCHAR(255) NOT NULL,
  "declared_content_type" VARCHAR(127) NOT NULL,
  "declared_size_bytes" INTEGER NOT NULL,
  "declared_sha256" CHAR(64) NOT NULL,
  "storage_object_key" VARCHAR(1024),
  "upload_expires_at" TIMESTAMPTZ(6),
  "quarantine_version_id" VARCHAR(255),
  "clean_object_key" VARCHAR(1024),
  "clean_version_id" VARCHAR(255),
  "detected_content_type" VARCHAR(127),
  "verified_size_bytes" INTEGER,
  "verified_sha256" CHAR(64),
  "scan_lease_token" UUID,
  "scan_lease_expires_at" TIMESTAMPTZ(6),
  "scan_available_at" TIMESTAMPTZ(6),
  "scan_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "scanned_at" TIMESTAMPTZ(6),
  "status" "ScannedPrescriptionStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "status_reason_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "scanned_prescriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scanned_prescriptions_size_check" CHECK ("declared_size_bytes" BETWEEN 1 AND 8388608),
  CONSTRAINT "scanned_prescriptions_sha_check" CHECK ("declared_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "scanned_prescriptions_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "scanned_prescriptions_pharmacy_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "scanned_prescription_status_history" (
  "id" UUID NOT NULL,
  "scanned_prescription_id" UUID NOT NULL,
  "from_status" "ScannedPrescriptionStatus",
  "to_status" "ScannedPrescriptionStatus" NOT NULL,
  "actor_principal_id" UUID,
  "reason_code" VARCHAR(100) NOT NULL,
  "patient_visible_note" VARCHAR(1000),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanned_prescription_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scanned_prescription_history_upload_fkey" FOREIGN KEY ("scanned_prescription_id") REFERENCES "scanned_prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "scanned_prescription_history_actor_fkey" FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "scanned_prescriptions_upload_number_key" ON "scanned_prescriptions"("upload_number");
CREATE UNIQUE INDEX "scanned_prescriptions_storage_object_key_key" ON "scanned_prescriptions"("storage_object_key");
CREATE UNIQUE INDEX "scanned_prescriptions_clean_object_key_key" ON "scanned_prescriptions"("clean_object_key");
CREATE INDEX "scanned_prescriptions_patient_created_idx" ON "scanned_prescriptions"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "scanned_prescriptions_pharmacy_status_idx" ON "scanned_prescriptions"("pharmacy_organization_id", "status", "created_at", "id");
CREATE INDEX "scanned_prescriptions_scan_queue_idx" ON "scanned_prescriptions"("status", "scan_available_at", "created_at", "id");
CREATE INDEX "scanned_prescription_history_upload_idx" ON "scanned_prescription_status_history"("scanned_prescription_id", "occurred_at", "id");

CREATE OR REPLACE FUNCTION prevent_scanned_prescription_file_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.original_filename IS DISTINCT FROM NEW.original_filename
     OR OLD.declared_content_type IS DISTINCT FROM NEW.declared_content_type
     OR OLD.declared_size_bytes IS DISTINCT FROM NEW.declared_size_bytes
     OR OLD.declared_sha256 IS DISTINCT FROM NEW.declared_sha256
     OR OLD.storage_object_key IS DISTINCT FROM NEW.storage_object_key
     OR OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
    RAISE EXCEPTION 'scanned prescription file identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scanned_prescription_file_immutable"
BEFORE UPDATE ON "scanned_prescriptions"
FOR EACH ROW EXECUTE FUNCTION prevent_scanned_prescription_file_mutation();

CREATE OR REPLACE FUNCTION validate_scanned_prescription_pharmacy()
RETURNS trigger AS $$
BEGIN
  IF NEW.pharmacy_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = NEW.pharmacy_organization_id
      AND type = 'PHARMACY'
      AND status = 'ACTIVE'
      AND verification_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'scanned prescription pharmacy must be active and verified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "scanned_prescription_pharmacy_valid"
AFTER INSERT OR UPDATE OF "pharmacy_organization_id" ON "scanned_prescriptions"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION validate_scanned_prescription_pharmacy();

CREATE OR REPLACE FUNCTION validate_scanned_prescription_status_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'AWAITING_UPLOAD' AND NEW.status IN ('QUARANTINED', 'REJECTED', 'WITHDRAWN'))
    OR (OLD.status = 'QUARANTINED' AND NEW.status IN ('SCANNING', 'REJECTED', 'WITHDRAWN'))
    OR (OLD.status = 'SCANNING' AND NEW.status IN ('CLEAN', 'QUARANTINED', 'REJECTED', 'SCAN_FAILED'))
    OR (OLD.status = 'CLEAN' AND NEW.status IN ('UNDER_REVIEW', 'WITHDRAWN'))
    OR (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED'))
    OR (OLD.status = 'MORE_INFORMATION_REQUIRED' AND NEW.status IN ('UNDER_REVIEW', 'WITHDRAWN'))
  ) THEN
    RAISE EXCEPTION 'invalid scanned prescription status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scanned_prescription_status_transition_valid"
BEFORE UPDATE OF "status" ON "scanned_prescriptions"
FOR EACH ROW EXECUTE FUNCTION validate_scanned_prescription_status_transition();

CREATE OR REPLACE FUNCTION record_scanned_prescription_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO scanned_prescription_status_history (
      id, scanned_prescription_id, from_status, to_status, reason_code, occurred_at
    ) VALUES (
      gen_random_uuid(), NEW.id, OLD.status, NEW.status,
      COALESCE(NEW.status_reason_code, 'STATUS_TRANSITION'), clock_timestamp()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scanned_prescription_status_history"
AFTER UPDATE OF "status" ON "scanned_prescriptions"
FOR EACH ROW EXECUTE FUNCTION record_scanned_prescription_status_change();

CREATE OR REPLACE FUNCTION prevent_scanned_prescription_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'scanned prescription status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scanned_prescription_history_immutable"
BEFORE UPDATE OR DELETE ON "scanned_prescription_status_history"
FOR EACH ROW EXECUTE FUNCTION prevent_scanned_prescription_history_mutation();
