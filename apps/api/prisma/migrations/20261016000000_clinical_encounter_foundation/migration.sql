BEGIN;

CREATE TYPE "ClinicalEncounterStatus" AS ENUM ('OPEN', 'SIGNED');
CREATE TYPE "ClinicalNoteKind" AS ENUM ('DRAFT', 'SIGNED', 'ADDENDUM');
CREATE TYPE "ClinicalDiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY', 'DIFFERENTIAL', 'PROVISIONAL');
CREATE TYPE "ClinicalDiagnosisStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR');
CREATE TYPE "ClinicalObservationValueType" AS ENUM ('QUANTITY', 'TEXT', 'CODED', 'BOOLEAN');

CREATE TABLE "clinical_encounters" (
  "id" UUID NOT NULL,
  "encounter_number" VARCHAR(64) NOT NULL,
  "appointment_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "practitioner_id" UUID NOT NULL,
  "status" "ClinicalEncounterStatus" NOT NULL DEFAULT 'OPEN',
  "opened_by_principal_id" UUID NOT NULL,
  "opened_at" TIMESTAMPTZ(6) NOT NULL,
  "signed_by_principal_id" UUID,
  "signed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_encounters_encounter_number_key" UNIQUE ("encounter_number"),
  CONSTRAINT "clinical_encounters_appointment_id_key" UNIQUE ("appointment_id"),
  CONSTRAINT "clinical_encounters_version_check" CHECK ("version" > 0),
  CONSTRAINT "clinical_encounters_signature_state_check" CHECK (
    ("status" = 'OPEN' AND "signed_by_principal_id" IS NULL AND "signed_at" IS NULL)
    OR ("status" = 'SIGNED' AND "signed_by_principal_id" IS NOT NULL AND "signed_at" IS NOT NULL AND "signed_at" >= "opened_at")
  ),
  CONSTRAINT "clinical_encounters_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounters_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounters_practitioner_id_fkey"
    FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounters_opened_by_principal_id_fkey"
    FOREIGN KEY ("opened_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounters_signed_by_principal_id_fkey"
    FOREIGN KEY ("signed_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "clinical_encounter_notes" (
  "id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" "ClinicalNoteKind" NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "documentation" JSONB NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "authored_by_principal_id" UUID NOT NULL,
  "authored_at" TIMESTAMPTZ(6) NOT NULL,
  "signed_at" TIMESTAMPTZ(6),
  "supersedes_note_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clinical_encounter_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_encounter_notes_encounter_revision_key" UNIQUE ("encounter_id", "revision"),
  CONSTRAINT "clinical_encounter_notes_revision_check" CHECK ("revision" > 0 AND "schema_version" > 0),
  CONSTRAINT "clinical_encounter_notes_documentation_check" CHECK (jsonb_typeof("documentation") = 'object'),
  CONSTRAINT "clinical_encounter_notes_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "clinical_encounter_notes_kind_check" CHECK (
    ("kind" = 'DRAFT' AND "signed_at" IS NULL AND "supersedes_note_id" IS NULL)
    OR ("kind" = 'SIGNED' AND "signed_at" IS NOT NULL AND "signed_at" >= "authored_at" AND "supersedes_note_id" IS NULL)
    OR ("kind" = 'ADDENDUM' AND "signed_at" IS NOT NULL AND "signed_at" >= "authored_at" AND "supersedes_note_id" IS NOT NULL)
  ),
  CONSTRAINT "clinical_encounter_notes_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounter_notes_authored_by_principal_id_fkey"
    FOREIGN KEY ("authored_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_encounter_notes_supersedes_note_id_fkey"
    FOREIGN KEY ("supersedes_note_id") REFERENCES "clinical_encounter_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "clinical_diagnoses" (
  "id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "note_id" UUID NOT NULL,
  "type" "ClinicalDiagnosisType" NOT NULL,
  "status" "ClinicalDiagnosisStatus" NOT NULL DEFAULT 'ACTIVE',
  "code_system" VARCHAR(255),
  "code" VARCHAR(100),
  "display" VARCHAR(500) NOT NULL,
  "onset_at" TIMESTAMPTZ(6),
  "recorded_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clinical_diagnoses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_diagnoses_display_check" CHECK (btrim("display") <> ''),
  CONSTRAINT "clinical_diagnoses_code_check" CHECK (
    ("code_system" IS NULL AND "code" IS NULL)
    OR (btrim("code_system") <> '' AND btrim("code") <> '')
  ),
  CONSTRAINT "clinical_diagnoses_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_diagnoses_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "clinical_encounter_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "clinical_observations" (
  "id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "note_id" UUID NOT NULL,
  "code_system" VARCHAR(255),
  "code" VARCHAR(100) NOT NULL,
  "display" VARCHAR(200) NOT NULL,
  "value_type" "ClinicalObservationValueType" NOT NULL,
  "numeric_value" DECIMAL(18,6),
  "text_value" VARCHAR(1000),
  "coded_value" VARCHAR(255),
  "boolean_value" BOOLEAN,
  "unit_code" VARCHAR(100),
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clinical_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_observations_code_check" CHECK (
    ("code_system" IS NULL OR btrim("code_system") <> '')
    AND btrim("code") <> ''
    AND btrim("display") <> ''
  ),
  CONSTRAINT "clinical_observations_value_check" CHECK (
    ("value_type" = 'QUANTITY' AND "numeric_value" IS NOT NULL AND "text_value" IS NULL AND "coded_value" IS NULL AND "boolean_value" IS NULL)
    OR ("value_type" = 'TEXT' AND "numeric_value" IS NULL AND "text_value" IS NOT NULL AND btrim("text_value") <> '' AND "coded_value" IS NULL AND "boolean_value" IS NULL AND "unit_code" IS NULL)
    OR ("value_type" = 'CODED' AND "numeric_value" IS NULL AND "text_value" IS NULL AND "coded_value" IS NOT NULL AND btrim("coded_value") <> '' AND "boolean_value" IS NULL AND "unit_code" IS NULL)
    OR ("value_type" = 'BOOLEAN' AND "numeric_value" IS NULL AND "text_value" IS NULL AND "coded_value" IS NULL AND "boolean_value" IS NOT NULL AND "unit_code" IS NULL)
  ),
  CONSTRAINT "clinical_observations_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_observations_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "clinical_encounter_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "clinical_notes_one_signed_base_key"
  ON "clinical_encounter_notes"("encounter_id") WHERE "kind" = 'SIGNED';
CREATE INDEX "clinical_encounters_patient_opened_idx"
  ON "clinical_encounters"("patient_id", "opened_at" DESC, "id" DESC);
CREATE INDEX "clinical_encounters_practitioner_opened_idx"
  ON "clinical_encounters"("practitioner_id", "opened_at" DESC, "id" DESC);
CREATE INDEX "clinical_encounters_status_opened_idx"
  ON "clinical_encounters"("status", "opened_at", "id");
CREATE INDEX "clinical_encounter_notes_encounter_authored_idx"
  ON "clinical_encounter_notes"("encounter_id", "authored_at" DESC, "id" DESC);
CREATE INDEX "clinical_diagnoses_encounter_type_idx"
  ON "clinical_diagnoses"("encounter_id", "type", "recorded_at", "id");
CREATE INDEX "clinical_diagnoses_code_idx"
  ON "clinical_diagnoses"("code_system", "code", "id");
CREATE INDEX "clinical_observations_encounter_observed_idx"
  ON "clinical_observations"("encounter_id", "observed_at", "id");
CREATE INDEX "clinical_observations_code_observed_idx"
  ON "clinical_observations"("code_system", "code", "observed_at", "id");

CREATE FUNCTION enforce_clinical_encounter_scope()
RETURNS trigger AS $$
DECLARE
  appointment_patient_id UUID;
  appointment_practitioner_id UUID;
  appointment_status "AppointmentStatus";
  practitioner_principal_id UUID;
  practitioner_verification "VerificationStatus";
BEGIN
  SELECT "patient_id", "practitioner_id", "status"
    INTO appointment_patient_id, appointment_practitioner_id, appointment_status
  FROM "appointments"
  WHERE "id" = NEW."appointment_id"
  FOR SHARE;

  IF appointment_patient_id IS DISTINCT FROM NEW."patient_id"
    OR appointment_practitioner_id IS DISTINCT FROM NEW."practitioner_id"
    OR appointment_status IS DISTINCT FROM 'CONFIRMED' THEN
    RAISE EXCEPTION 'Clinical encounter requires its matching confirmed appointment';
  END IF;

  SELECT "principal_id", "verification_status"
    INTO practitioner_principal_id, practitioner_verification
  FROM "practitioners"
  WHERE "id" = NEW."practitioner_id"
  FOR SHARE;

  IF practitioner_verification IS DISTINCT FROM 'VERIFIED'
    OR practitioner_principal_id IS DISTINCT FROM NEW."opened_by_principal_id" THEN
    RAISE EXCEPTION 'Clinical encounter must be opened by its verified appointment practitioner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_clinical_encounter_update()
RETURNS trigger AS $$
DECLARE
  practitioner_principal_id UUID;
  practitioner_verification "VerificationStatus";
  appointment_status "AppointmentStatus";
BEGIN
  IF NEW."encounter_number" IS DISTINCT FROM OLD."encounter_number"
    OR NEW."appointment_id" IS DISTINCT FROM OLD."appointment_id"
    OR NEW."patient_id" IS DISTINCT FROM OLD."patient_id"
    OR NEW."practitioner_id" IS DISTINCT FROM OLD."practitioner_id"
    OR NEW."opened_by_principal_id" IS DISTINCT FROM OLD."opened_by_principal_id"
    OR NEW."opened_at" IS DISTINCT FROM OLD."opened_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Clinical encounter identity is immutable';
  END IF;

  IF OLD."status" <> 'OPEN' OR NEW."status" <> 'SIGNED' THEN
    RAISE EXCEPTION 'Invalid clinical encounter transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Clinical encounter version must increment exactly once';
  END IF;

  SELECT "principal_id", "verification_status"
    INTO practitioner_principal_id, practitioner_verification
  FROM "practitioners" WHERE "id" = NEW."practitioner_id";
  SELECT "status" INTO appointment_status
  FROM "appointments" WHERE "id" = NEW."appointment_id";
  IF practitioner_principal_id IS DISTINCT FROM NEW."signed_by_principal_id"
    OR practitioner_verification IS DISTINCT FROM 'VERIFIED'
    OR appointment_status NOT IN ('CONFIRMED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Clinical encounter requires its verified appointment practitioner and active care relationship';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "clinical_encounter_notes" note
    WHERE note."encounter_id" = NEW."id" AND note."kind" = 'SIGNED'
  ) OR NOT EXISTS (
    SELECT 1
    FROM "clinical_diagnoses" diagnosis
    JOIN "clinical_encounter_notes" note ON note."id" = diagnosis."note_id"
    WHERE diagnosis."encounter_id" = NEW."id"
      AND diagnosis."type" = 'PRIMARY'
      AND diagnosis."status" <> 'ENTERED_IN_ERROR'
      AND note."kind" = 'SIGNED'
  ) THEN
    RAISE EXCEPTION 'Signed clinical encounter requires a signed note and primary diagnosis';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_clinical_note_insert()
RETURNS trigger AS $$
DECLARE
  encounter_status "ClinicalEncounterStatus";
  practitioner_principal_id UUID;
  practitioner_verification "VerificationStatus";
  next_revision INTEGER;
  superseded_encounter_id UUID;
  superseded_kind "ClinicalNoteKind";
BEGIN
  SELECT encounter."status", practitioner."principal_id", practitioner."verification_status"
    INTO encounter_status, practitioner_principal_id, practitioner_verification
  FROM "clinical_encounters" encounter
  JOIN "practitioners" practitioner ON practitioner."id" = encounter."practitioner_id"
  WHERE encounter."id" = NEW."encounter_id"
  FOR UPDATE OF encounter;

  IF practitioner_principal_id IS DISTINCT FROM NEW."authored_by_principal_id"
    OR practitioner_verification IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Clinical note must be authored by the verified encounter practitioner';
  END IF;

  SELECT COALESCE(MAX("revision"), 0) + 1 INTO next_revision
  FROM "clinical_encounter_notes" WHERE "encounter_id" = NEW."encounter_id";
  IF NEW."revision" <> next_revision THEN
    RAISE EXCEPTION 'Clinical note revision must be the next encounter revision';
  END IF;

  IF NEW."kind" IN ('DRAFT', 'SIGNED') AND encounter_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Draft and signed base notes require an open encounter';
  ELSIF NEW."kind" = 'ADDENDUM' THEN
    IF encounter_status <> 'SIGNED' THEN
      RAISE EXCEPTION 'Clinical addendum requires a signed encounter';
    END IF;
    SELECT "encounter_id", "kind" INTO superseded_encounter_id, superseded_kind
    FROM "clinical_encounter_notes" WHERE "id" = NEW."supersedes_note_id";
    IF superseded_encounter_id IS DISTINCT FROM NEW."encounter_id"
      OR superseded_kind NOT IN ('SIGNED', 'ADDENDUM') THEN
      RAISE EXCEPTION 'Clinical addendum must supersede a signed note in the same encounter';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_clinical_fact_insert()
RETURNS trigger AS $$
DECLARE
  note_encounter_id UUID;
  note_kind "ClinicalNoteKind";
BEGIN
  SELECT "encounter_id", "kind" INTO note_encounter_id, note_kind
  FROM "clinical_encounter_notes" WHERE "id" = NEW."note_id";
  IF note_encounter_id IS DISTINCT FROM NEW."encounter_id"
    OR note_kind NOT IN ('SIGNED', 'ADDENDUM') THEN
    RAISE EXCEPTION 'Clinical fact must belong to a signed note in the same encounter';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_clinical_record_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Signed clinical record entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "clinical_encounters_scope_guard"
BEFORE INSERT ON "clinical_encounters"
FOR EACH ROW EXECUTE FUNCTION enforce_clinical_encounter_scope();

CREATE TRIGGER "clinical_encounters_update_guard"
BEFORE UPDATE ON "clinical_encounters"
FOR EACH ROW EXECUTE FUNCTION enforce_clinical_encounter_update();

CREATE TRIGGER "clinical_encounters_delete_guard"
BEFORE DELETE ON "clinical_encounters"
FOR EACH ROW EXECUTE FUNCTION reject_clinical_record_mutation();

CREATE TRIGGER "clinical_notes_insert_guard"
BEFORE INSERT ON "clinical_encounter_notes"
FOR EACH ROW EXECUTE FUNCTION enforce_clinical_note_insert();

CREATE TRIGGER "clinical_notes_mutation_guard"
BEFORE UPDATE OR DELETE ON "clinical_encounter_notes"
FOR EACH ROW EXECUTE FUNCTION reject_clinical_record_mutation();

CREATE TRIGGER "clinical_diagnoses_insert_guard"
BEFORE INSERT ON "clinical_diagnoses"
FOR EACH ROW EXECUTE FUNCTION enforce_clinical_fact_insert();

CREATE TRIGGER "clinical_diagnoses_mutation_guard"
BEFORE UPDATE OR DELETE ON "clinical_diagnoses"
FOR EACH ROW EXECUTE FUNCTION reject_clinical_record_mutation();

CREATE TRIGGER "clinical_observations_insert_guard"
BEFORE INSERT ON "clinical_observations"
FOR EACH ROW EXECUTE FUNCTION enforce_clinical_fact_insert();

CREATE TRIGGER "clinical_observations_mutation_guard"
BEFORE UPDATE OR DELETE ON "clinical_observations"
FOR EACH ROW EXECUTE FUNCTION reject_clinical_record_mutation();

COMMIT;
