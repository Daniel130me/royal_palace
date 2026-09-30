BEGIN;

-- CreateEnum
CREATE TYPE "OnboardingApplicationKind" AS ENUM ('PATIENT', 'ORGANIZATION', 'PRACTITIONER');

-- CreateEnum
CREATE TYPE "OnboardingApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationNoteVisibility" AS ENUM ('APPLICANT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ApplicationDocumentStatus" AS ENUM ('AWAITING_UPLOAD', 'QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED');

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "phone_e164" VARCHAR(16),
    "country_code" CHAR(2),
    "preferred_language" VARCHAR(35),
    "onboarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_registrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_number" VARCHAR(160) NOT NULL,
    "authority_name" VARCHAR(200) NOT NULL,
    "jurisdiction_code" VARCHAR(16) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organization_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_credentials" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "credential_type" VARCHAR(80) NOT NULL,
    "registration_number" VARCHAR(160) NOT NULL,
    "issuer_name" VARCHAR(200) NOT NULL,
    "jurisdiction_code" VARCHAR(16) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "practitioner_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_applications" (
    "id" UUID NOT NULL,
    "kind" "OnboardingApplicationKind" NOT NULL,
    "applicant_principal_id" UUID NOT NULL,
    "status" "OnboardingApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "review_started_by_principal_id" UUID,
    "decided_by_principal_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "review_started_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "approved_patient_id" UUID,
    "approved_organization_id" UUID,
    "approved_practitioner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "onboarding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_application_details" (
    "application_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "phone_e164" VARCHAR(16),
    "country_code" CHAR(2),
    "preferred_language" VARCHAR(35),

    CONSTRAINT "patient_application_details_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "organization_application_details" (
    "application_id" UUID NOT NULL,
    "organization_type" "OrganizationType" NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "registration_number" VARCHAR(160) NOT NULL,
    "registration_authority" VARCHAR(200) NOT NULL,
    "jurisdiction_code" VARCHAR(16) NOT NULL,
    "contact_name" VARCHAR(160) NOT NULL,
    "contact_email" VARCHAR(320) NOT NULL,
    "contact_phone_e164" VARCHAR(16),
    "address_line_1" VARCHAR(200),
    "address_line_2" VARCHAR(200),
    "locality" VARCHAR(100),
    "administrative_area" VARCHAR(100),
    "postal_code" VARCHAR(32),
    "country_code" CHAR(2) NOT NULL,

    CONSTRAINT "organization_application_details_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "organization_application_services" (
    "application_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "organization_application_services_pkey" PRIMARY KEY ("application_id","service_id")
);

-- CreateTable
CREATE TABLE "practitioner_application_details" (
    "application_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100) NOT NULL,
    "honorific" VARCHAR(40),
    "biography" VARCHAR(3000),
    "credential_type" VARCHAR(80) NOT NULL,
    "registration_number" VARCHAR(160) NOT NULL,
    "registration_authority" VARCHAR(200) NOT NULL,
    "jurisdiction_code" VARCHAR(16) NOT NULL,
    "selected_organization_id" UUID,
    "facility_name" VARCHAR(200),

    CONSTRAINT "practitioner_application_details_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "practitioner_application_professions" (
    "application_id" UUID NOT NULL,
    "profession_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practitioner_application_professions_pkey" PRIMARY KEY ("application_id","profession_id")
);

-- CreateTable
CREATE TABLE "practitioner_application_specialties" (
    "application_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practitioner_application_specialties_pkey" PRIMARY KEY ("application_id","specialty_id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "purpose" VARCHAR(80) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "declared_content_type" VARCHAR(127) NOT NULL,
    "declared_size_bytes" INTEGER NOT NULL,
    "declared_sha256" CHAR(64) NOT NULL,
    "storage_object_key" VARCHAR(1024),
    "status" "ApplicationDocumentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "status_reason_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "OnboardingApplicationStatus",
    "to_status" "OnboardingApplicationStatus" NOT NULL,
    "actor_principal_id" UUID,
    "reason_category" VARCHAR(100) NOT NULL,
    "note" VARCHAR(2000),
    "note_visibility" "ApplicationNoteVisibility" NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_principal_id_key" ON "patients"("principal_id");

-- CreateIndex
CREATE INDEX "patients_name_id_idx" ON "patients"("family_name", "given_name", "id");

-- CreateIndex
CREATE INDEX "organization_registrations_org_verified_idx" ON "organization_registrations"("organization_id", "verified_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_registrations_authority_jurisdiction_number_key" ON "organization_registrations"("authority_name", "jurisdiction_code", "registration_number");

-- CreateIndex
CREATE INDEX "practitioner_credentials_practitioner_verified_idx" ON "practitioner_credentials"("practitioner_id", "verified_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_credentials_issuer_jurisdiction_registration_key" ON "practitioner_credentials"("issuer_name", "jurisdiction_code", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_applications_approved_patient_id_key" ON "onboarding_applications"("approved_patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_applications_approved_organization_id_key" ON "onboarding_applications"("approved_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_applications_approved_practitioner_id_key" ON "onboarding_applications"("approved_practitioner_id");

-- CreateIndex
CREATE INDEX "onboarding_applications_applicant_kind_status_created_idx" ON "onboarding_applications"("applicant_principal_id", "kind", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "onboarding_applications_review_queue_idx" ON "onboarding_applications"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "organization_application_details_registration_idx" ON "organization_application_details"("registration_authority", "jurisdiction_code", "registration_number");

-- CreateIndex
CREATE INDEX "organization_application_details_location_idx" ON "organization_application_details"("country_code", "administrative_area", "locality");

-- CreateIndex
CREATE INDEX "organization_application_services_service_idx" ON "organization_application_services"("service_id", "application_id");

-- CreateIndex
CREATE INDEX "practitioner_application_details_registration_idx" ON "practitioner_application_details"("registration_authority", "jurisdiction_code", "registration_number");

-- CreateIndex
CREATE INDEX "practitioner_application_details_organization_idx" ON "practitioner_application_details"("selected_organization_id", "application_id");

-- CreateIndex
CREATE INDEX "practitioner_application_professions_profession_idx" ON "practitioner_application_professions"("profession_id", "application_id");

-- CreateIndex
CREATE INDEX "practitioner_application_specialties_specialty_idx" ON "practitioner_application_specialties"("specialty_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_storage_object_key_key" ON "application_documents"("storage_object_key");

-- CreateIndex
CREATE INDEX "application_documents_application_status_idx" ON "application_documents"("application_id", "status", "created_at", "id");

-- CreateIndex
CREATE INDEX "application_status_history_application_occurred_idx" ON "application_status_history"("application_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "application_status_history_actor_occurred_idx" ON "application_status_history"("actor_principal_id", "occurred_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_registrations" ADD CONSTRAINT "organization_registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_credentials" ADD CONSTRAINT "practitioner_credentials_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_applicant_principal_id_fkey" FOREIGN KEY ("applicant_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_review_started_by_principal_id_fkey" FOREIGN KEY ("review_started_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_decided_by_principal_id_fkey" FOREIGN KEY ("decided_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_approved_patient_id_fkey" FOREIGN KEY ("approved_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_approved_organization_id_fkey" FOREIGN KEY ("approved_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_approved_practitioner_id_fkey" FOREIGN KEY ("approved_practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_application_details" ADD CONSTRAINT "patient_application_details_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_application_details" ADD CONSTRAINT "organization_application_details_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_application_services" ADD CONSTRAINT "organization_application_services_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "organization_application_details"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_application_services" ADD CONSTRAINT "organization_application_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_details" ADD CONSTRAINT "practitioner_application_details_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_details" ADD CONSTRAINT "practitioner_application_details_selected_organization_id_fkey" FOREIGN KEY ("selected_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_professions" ADD CONSTRAINT "practitioner_application_professions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "practitioner_application_details"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_professions" ADD CONSTRAINT "practitioner_application_professions_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "profession_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_specialties" ADD CONSTRAINT "practitioner_application_specialties_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "practitioner_application_details"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_application_specialties" ADD CONSTRAINT "practitioner_application_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialty_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_actor_principal_id_fkey" FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express.
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_names_not_blank" CHECK (
    length(btrim("given_name")) > 0 AND length(btrim("family_name")) > 0
  ),
  ADD CONSTRAINT "patients_country_code_valid" CHECK (
    "country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'
  ),
  ADD CONSTRAINT "patients_phone_e164_valid" CHECK (
    "phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{1,14}$'
  ),
  ADD CONSTRAINT "patients_language_tag_valid" CHECK (
    "preferred_language" IS NULL OR "preferred_language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
  ),
  ADD CONSTRAINT "patients_version_positive" CHECK ("version" > 0);

ALTER TABLE "organization_registrations"
  ADD CONSTRAINT "organization_registrations_number_not_blank" CHECK (
    length(btrim("registration_number")) > 0
  ),
  ADD CONSTRAINT "organization_registrations_authority_not_blank" CHECK (
    length(btrim("authority_name")) > 0
  ),
  ADD CONSTRAINT "organization_registrations_jurisdiction_not_blank" CHECK (
    length(btrim("jurisdiction_code")) > 0
  ),
  ADD CONSTRAINT "organization_registrations_version_positive" CHECK ("version" > 0);

ALTER TABLE "practitioner_credentials"
  ADD CONSTRAINT "practitioner_credentials_values_not_blank" CHECK (
    length(btrim("credential_type")) > 0
    AND length(btrim("registration_number")) > 0
    AND length(btrim("issuer_name")) > 0
  ),
  ADD CONSTRAINT "practitioner_credentials_jurisdiction_not_blank" CHECK (
    length(btrim("jurisdiction_code")) > 0
  ),
  ADD CONSTRAINT "practitioner_credentials_version_positive" CHECK ("version" > 0);

ALTER TABLE "onboarding_applications"
  ADD CONSTRAINT "onboarding_applications_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "onboarding_applications_timestamps_match_status" CHECK (
    ("status" = 'DRAFT' AND "submitted_at" IS NULL AND "decided_at" IS NULL AND "withdrawn_at" IS NULL)
    OR ("status" IN ('SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED') AND "submitted_at" IS NOT NULL AND "decided_at" IS NULL AND "withdrawn_at" IS NULL)
    OR ("status" IN ('APPROVED', 'REJECTED') AND "submitted_at" IS NOT NULL AND "decided_at" IS NOT NULL AND "withdrawn_at" IS NULL)
    OR ("status" = 'WITHDRAWN' AND "withdrawn_at" IS NOT NULL AND "decided_at" IS NULL)
  ),
  ADD CONSTRAINT "onboarding_applications_review_fields_consistent" CHECK (
    ("review_started_at" IS NULL AND "review_started_by_principal_id" IS NULL)
    OR ("review_started_at" IS NOT NULL AND "review_started_by_principal_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "onboarding_applications_decision_fields_consistent" CHECK (
    ("decided_at" IS NULL AND "decided_by_principal_id" IS NULL)
    OR ("decided_at" IS NOT NULL AND "decided_by_principal_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "onboarding_applications_approved_target_matches_kind" CHECK (
    ("status" <> 'APPROVED' AND "approved_patient_id" IS NULL AND "approved_organization_id" IS NULL AND "approved_practitioner_id" IS NULL)
    OR ("status" = 'APPROVED' AND "kind" = 'PATIENT' AND "approved_patient_id" IS NOT NULL AND "approved_organization_id" IS NULL AND "approved_practitioner_id" IS NULL)
    OR ("status" = 'APPROVED' AND "kind" = 'ORGANIZATION' AND "approved_patient_id" IS NULL AND "approved_organization_id" IS NOT NULL AND "approved_practitioner_id" IS NULL)
    OR ("status" = 'APPROVED' AND "kind" = 'PRACTITIONER' AND "approved_patient_id" IS NULL AND "approved_organization_id" IS NULL AND "approved_practitioner_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "onboarding_applications_one_open_kind_per_applicant_key"
  ON "onboarding_applications"("applicant_principal_id", "kind")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED');

ALTER TABLE "patient_application_details"
  ADD CONSTRAINT "patient_application_details_names_not_blank" CHECK (
    length(btrim("given_name")) > 0 AND length(btrim("family_name")) > 0
  ),
  ADD CONSTRAINT "patient_application_details_country_code_valid" CHECK (
    "country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'
  ),
  ADD CONSTRAINT "patient_application_details_phone_e164_valid" CHECK (
    "phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{1,14}$'
  ),
  ADD CONSTRAINT "patient_application_details_language_tag_valid" CHECK (
    "preferred_language" IS NULL OR "preferred_language" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
  );

ALTER TABLE "organization_application_details"
  ADD CONSTRAINT "organization_application_details_values_not_blank" CHECK (
    length(btrim("legal_name")) > 0
    AND length(btrim("display_name")) > 0
    AND length(btrim("registration_number")) > 0
    AND length(btrim("registration_authority")) > 0
    AND length(btrim("jurisdiction_code")) > 0
    AND length(btrim("contact_name")) > 0
    AND length(btrim("contact_email")) > 0
  ),
  ADD CONSTRAINT "organization_application_details_country_code_valid" CHECK (
    "country_code" ~ '^[A-Z]{2}$'
  ),
  ADD CONSTRAINT "organization_application_details_phone_e164_valid" CHECK (
    "contact_phone_e164" IS NULL OR "contact_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'
  ),
  ADD CONSTRAINT "organization_application_details_address_present" CHECK (
    COALESCE(length(btrim("address_line_1")), 0) > 0
    OR COALESCE(length(btrim("locality")), 0) > 0
    OR COALESCE(length(btrim("administrative_area")), 0) > 0
  );

ALTER TABLE "practitioner_application_details"
  ADD CONSTRAINT "practitioner_application_details_values_not_blank" CHECK (
    length(btrim("given_name")) > 0
    AND length(btrim("family_name")) > 0
    AND length(btrim("credential_type")) > 0
    AND length(btrim("registration_number")) > 0
    AND length(btrim("registration_authority")) > 0
    AND length(btrim("jurisdiction_code")) > 0
  ),
  ADD CONSTRAINT "practitioner_application_details_facility_name_not_blank" CHECK (
    "facility_name" IS NULL OR length(btrim("facility_name")) > 0
  );

CREATE UNIQUE INDEX "practitioner_application_professions_one_primary_key"
  ON "practitioner_application_professions"("application_id") WHERE "is_primary";
CREATE UNIQUE INDEX "practitioner_application_specialties_one_primary_key"
  ON "practitioner_application_specialties"("application_id") WHERE "is_primary";

ALTER TABLE "application_documents"
  ADD CONSTRAINT "application_documents_values_not_blank" CHECK (
    length(btrim("purpose")) > 0
    AND length(btrim("original_filename")) > 0
    AND length(btrim("declared_content_type")) > 0
  ),
  ADD CONSTRAINT "application_documents_size_positive" CHECK ("declared_size_bytes" > 0),
  ADD CONSTRAINT "application_documents_sha256_valid" CHECK (
    "declared_sha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "application_documents_storage_state_consistent" CHECK (
    ("status" = 'AWAITING_UPLOAD' AND "storage_object_key" IS NULL)
    OR ("status" <> 'AWAITING_UPLOAD' AND "storage_object_key" IS NOT NULL)
  ),
  ADD CONSTRAINT "application_documents_version_positive" CHECK ("version" > 0);

ALTER TABLE "application_status_history"
  ADD CONSTRAINT "application_status_history_reason_not_blank" CHECK (
    length(btrim("reason_category")) > 0
  ),
  ADD CONSTRAINT "application_status_history_request_id_not_blank" CHECK (
    length(btrim("request_id")) > 0
  ),
  ADD CONSTRAINT "application_status_history_transition_changes_state" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  );

CREATE OR REPLACE FUNCTION prevent_application_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'application status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "application_status_history_no_update"
  BEFORE UPDATE ON "application_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_application_history_mutation();
CREATE TRIGGER "application_status_history_no_delete"
  BEFORE DELETE ON "application_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_application_history_mutation();

CREATE OR REPLACE FUNCTION prevent_application_identity_change()
RETURNS trigger AS $$
BEGIN
  IF NEW."kind" <> OLD."kind" OR NEW."applicant_principal_id" <> OLD."applicant_principal_id" THEN
    RAISE EXCEPTION 'application kind and applicant are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "onboarding_applications_identity_immutable"
  BEFORE UPDATE ON "onboarding_applications"
  FOR EACH ROW EXECUTE FUNCTION prevent_application_identity_change();

-- A deferred constraint permits the aggregate and its typed detail to be inserted
-- in either statement order inside one transaction, but never committed incomplete.
CREATE OR REPLACE FUNCTION enforce_application_typed_detail()
RETURNS trigger AS $$
DECLARE
  target_application_id uuid;
  application_kind "OnboardingApplicationKind";
  patient_count integer;
  organization_count integer;
  practitioner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'onboarding_applications' THEN
    IF TG_OP = 'DELETE' THEN
      target_application_id := OLD."id";
    ELSE
      target_application_id := NEW."id";
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_application_id := OLD."application_id";
    ELSE
      target_application_id := NEW."application_id";
    END IF;
  END IF;

  SELECT "kind" INTO application_kind
    FROM "onboarding_applications" WHERE "id" = target_application_id;
  IF application_kind IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO patient_count
    FROM "patient_application_details" WHERE "application_id" = target_application_id;
  SELECT count(*) INTO organization_count
    FROM "organization_application_details" WHERE "application_id" = target_application_id;
  SELECT count(*) INTO practitioner_count
    FROM "practitioner_application_details" WHERE "application_id" = target_application_id;

  IF patient_count + organization_count + practitioner_count <> 1
    OR (application_kind = 'PATIENT' AND patient_count <> 1)
    OR (application_kind = 'ORGANIZATION' AND organization_count <> 1)
    OR (application_kind = 'PRACTITIONER' AND practitioner_count <> 1) THEN
    RAISE EXCEPTION 'application must have exactly one typed detail matching its kind';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "onboarding_applications_typed_detail_required"
  AFTER INSERT OR UPDATE ON "onboarding_applications"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_application_typed_detail();
CREATE CONSTRAINT TRIGGER "patient_application_detail_kind_consistent"
  AFTER INSERT OR UPDATE OR DELETE ON "patient_application_details"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_application_typed_detail();
CREATE CONSTRAINT TRIGGER "organization_application_detail_kind_consistent"
  AFTER INSERT OR UPDATE OR DELETE ON "organization_application_details"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_application_typed_detail();
CREATE CONSTRAINT TRIGGER "practitioner_application_detail_kind_consistent"
  AFTER INSERT OR UPDATE OR DELETE ON "practitioner_application_details"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_application_typed_detail();

-- Taxonomy hierarchy integrity must also hold for maintenance scripts and
-- future integrations that write outside the administration API.
CREATE OR REPLACE FUNCTION prevent_specialty_hierarchy_cycle()
RETURNS trigger AS $$
BEGIN
  IF NEW."parent_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."parent_id" = NEW."id" THEN
    RAISE EXCEPTION 'a specialty cannot be its own parent';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT "id", "parent_id"
      FROM "specialty_taxonomies"
      WHERE "id" = NEW."parent_id"
      UNION
      SELECT parent."id", parent."parent_id"
      FROM "specialty_taxonomies" parent
      INNER JOIN ancestors child ON parent."id" = child."parent_id"
    )
    SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'specialty hierarchy cannot contain a cycle';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "specialty_taxonomies_no_hierarchy_cycle"
  BEFORE INSERT OR UPDATE OF "parent_id" ON "specialty_taxonomies"
  FOR EACH ROW EXECUTE FUNCTION prevent_specialty_hierarchy_cycle();

COMMIT;
