BEGIN;

CREATE TYPE "ClinicalReferralStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ClinicalCarePlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ClinicalAllergyStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR');
CREATE TYPE "ClinicalAllergyCriticality" AS ENUM ('LOW', 'HIGH', 'UNABLE_TO_ASSESS');
CREATE TYPE "ClinicalAttachmentSourceType" AS ENUM (
  'LABORATORY_RESULT_ATTACHMENT',
  'SCANNED_PRESCRIPTION',
  'APPLICATION_DOCUMENT'
);

ALTER TABLE "prescriptions" ADD COLUMN "encounter_id" UUID;
ALTER TABLE "laboratory_requests" ADD COLUMN "encounter_id" UUID;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT;
ALTER TABLE "laboratory_requests"
  ADD CONSTRAINT "laboratory_requests_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT;

CREATE INDEX "prescriptions_encounter_created_idx"
  ON "prescriptions"("encounter_id", "created_at", "id");
CREATE INDEX "laboratory_requests_encounter_created_idx"
  ON "laboratory_requests"("encounter_id", "created_at", "id");

CREATE TABLE "clinical_referrals" (
  "id" UUID PRIMARY KEY,
  "encounter_id" UUID NOT NULL REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT,
  "created_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT,
  "specialty_code" VARCHAR(120) NOT NULL,
  "recipient_name" VARCHAR(200),
  "reason" VARCHAR(2000) NOT NULL,
  "priority" VARCHAR(32) NOT NULL,
  "status" "ClinicalReferralStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "clinical_referrals_priority_check" CHECK (
    "priority" IN ('ROUTINE', 'URGENT', 'EMERGENCY')
  )
);

CREATE TABLE "clinical_care_plans" (
  "id" UUID PRIMARY KEY,
  "encounter_id" UUID NOT NULL REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT,
  "updated_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT,
  "title" VARCHAR(200) NOT NULL,
  "goal" VARCHAR(2000) NOT NULL,
  "activities" JSONB NOT NULL,
  "status" "ClinicalCarePlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "clinical_care_plans_date_check" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
  CONSTRAINT "clinical_care_plans_activities_check" CHECK (
    jsonb_typeof("activities") = 'array'
    AND jsonb_array_length("activities") BETWEEN 1 AND 50
  )
);

CREATE TABLE "clinical_allergies" (
  "id" UUID PRIMARY KEY,
  "encounter_id" UUID NOT NULL REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT,
  "recorded_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT,
  "substance_code" VARCHAR(120),
  "substance_code_system" VARCHAR(255),
  "substance_display" VARCHAR(300) NOT NULL,
  "reaction" VARCHAR(1000),
  "criticality" "ClinicalAllergyCriticality" NOT NULL,
  "status" "ClinicalAllergyStatus" NOT NULL DEFAULT 'ACTIVE',
  "recorded_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "clinical_allergies_code_pair_check" CHECK (
    ("substance_code" IS NULL AND "substance_code_system" IS NULL) OR
    ("substance_code" IS NOT NULL AND "substance_code_system" IS NOT NULL)
  )
);

CREATE TABLE "clinical_attachment_references" (
  "id" UUID PRIMARY KEY,
  "encounter_id" UUID NOT NULL REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT,
  "linked_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT,
  "source_type" "ClinicalAttachmentSourceType" NOT NULL,
  "source_id" UUID NOT NULL,
  "purpose" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_attachment_references_source_key" UNIQUE ("encounter_id", "source_type", "source_id")
);

CREATE INDEX "clinical_referrals_encounter_created_idx"
  ON "clinical_referrals"("encounter_id", "created_at", "id");
CREATE INDEX "clinical_referrals_patient_status_created_idx"
  ON "clinical_referrals"("patient_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "clinical_care_plans_encounter_created_idx"
  ON "clinical_care_plans"("encounter_id", "created_at", "id");
CREATE INDEX "clinical_care_plans_patient_status_updated_idx"
  ON "clinical_care_plans"("patient_id", "status", "updated_at" DESC, "id" DESC);
CREATE INDEX "clinical_allergies_encounter_recorded_idx"
  ON "clinical_allergies"("encounter_id", "recorded_at", "id");
CREATE INDEX "clinical_allergies_patient_status_recorded_idx"
  ON "clinical_allergies"("patient_id", "status", "recorded_at" DESC, "id" DESC);
CREATE INDEX "clinical_attachment_references_encounter_created_idx"
  ON "clinical_attachment_references"("encounter_id", "created_at", "id");

CREATE OR REPLACE FUNCTION enforce_clinical_action_scope() RETURNS trigger AS $$
DECLARE
  encounter_row RECORD;
BEGIN
  IF NEW.encounter_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT appointment_id, patient_id, practitioner_id, status
    INTO encounter_row
    FROM clinical_encounters
    WHERE id = NEW.encounter_id;
  IF encounter_row IS NULL
     OR encounter_row.appointment_id <> NEW.appointment_id
     OR encounter_row.patient_id <> NEW.patient_id
     OR encounter_row.practitioner_id <> NEW.practitioner_id
     OR encounter_row.status NOT IN ('OPEN', 'SIGNED') THEN
    RAISE EXCEPTION 'clinical action scope does not match encounter' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "prescriptions_clinical_scope_guard"
  BEFORE INSERT OR UPDATE OF "encounter_id", "appointment_id", "patient_id", "practitioner_id"
  ON "prescriptions" FOR EACH ROW EXECUTE FUNCTION enforce_clinical_action_scope();
CREATE TRIGGER "laboratory_requests_clinical_scope_guard"
  BEFORE INSERT OR UPDATE OF "encounter_id", "appointment_id", "patient_id", "practitioner_id"
  ON "laboratory_requests" FOR EACH ROW EXECUTE FUNCTION enforce_clinical_action_scope();

CREATE OR REPLACE FUNCTION enforce_clinical_child_scope() RETURNS trigger AS $$
DECLARE
  encounter_row RECORD;
BEGIN
  SELECT patient_id, practitioner_id INTO encounter_row
    FROM clinical_encounters WHERE id = NEW.encounter_id;
  IF encounter_row IS NULL
     OR encounter_row.patient_id <> NEW.patient_id
     OR encounter_row.practitioner_id <> NEW.practitioner_id THEN
    RAISE EXCEPTION 'clinical child scope does not match encounter' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "clinical_referrals_scope_guard"
  BEFORE INSERT OR UPDATE OF "encounter_id", "patient_id", "practitioner_id"
  ON "clinical_referrals" FOR EACH ROW EXECUTE FUNCTION enforce_clinical_child_scope();
CREATE TRIGGER "clinical_care_plans_scope_guard"
  BEFORE INSERT OR UPDATE OF "encounter_id", "patient_id", "practitioner_id"
  ON "clinical_care_plans" FOR EACH ROW EXECUTE FUNCTION enforce_clinical_child_scope();
CREATE TRIGGER "clinical_allergies_scope_guard"
  BEFORE INSERT OR UPDATE OF "encounter_id", "patient_id", "practitioner_id"
  ON "clinical_allergies" FOR EACH ROW EXECUTE FUNCTION enforce_clinical_child_scope();

COMMIT;
