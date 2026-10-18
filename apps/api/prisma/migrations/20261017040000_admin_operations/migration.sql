BEGIN;

CREATE TYPE "PlatformComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');
CREATE TYPE "PlatformComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "practitioner_credentials"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6);

CREATE TABLE "platform_complaints" (
  "id" UUID NOT NULL,
  "complaint_number" VARCHAR(64) NOT NULL,
  "submitted_by_principal_id" UUID,
  "complainant_type" VARCHAR(40) NOT NULL,
  "subject" VARCHAR(240) NOT NULL,
  "description" VARCHAR(4000) NOT NULL,
  "priority" "PlatformComplaintPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "PlatformComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "platform_complaints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_complaints_number_key" UNIQUE ("complaint_number"),
  CONSTRAINT "platform_complaints_submitter_fkey"
    FOREIGN KEY ("submitted_by_principal_id") REFERENCES "identity_principals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_complaints_type_check"
    CHECK ("complainant_type" IN ('PATIENT', 'MANAGER', 'ORGANIZATION_APPLICANT', 'ORGANIZATION_ADMIN', 'ORGANIZATION_STAFF', 'PROVIDER', 'SUPPORT', 'ADMINISTRATOR', 'FINANCE', 'LOGISTICS', 'SYSTEM_WORKER', 'EXTERNAL')),
  CONSTRAINT "platform_complaints_content_check"
    CHECK (length(btrim("subject")) > 0 AND length(btrim("description")) > 0),
  CONSTRAINT "platform_complaints_version_check" CHECK ("version" > 0),
  CONSTRAINT "platform_complaints_resolution_check"
    CHECK (("status" IN ('RESOLVED', 'CLOSED')) = ("resolved_at" IS NOT NULL))
);

CREATE TABLE "platform_complaint_status_history" (
  "id" UUID NOT NULL,
  "complaint_id" UUID NOT NULL,
  "actor_principal_id" UUID NOT NULL,
  "from_status" "PlatformComplaintStatus" NOT NULL,
  "to_status" "PlatformComplaintStatus" NOT NULL,
  "internal_note" VARCHAR(2000),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "platform_complaint_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_complaint_history_complaint_fkey"
    FOREIGN KEY ("complaint_id") REFERENCES "platform_complaints"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_complaint_history_actor_fkey"
    FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_complaint_history_note_check"
    CHECK ("internal_note" IS NULL OR length(btrim("internal_note")) > 0)
);

CREATE INDEX "practitioner_credentials_expiry_idx"
  ON "practitioner_credentials"("expires_at", "id");
CREATE INDEX "platform_complaints_status_priority_created_idx"
  ON "platform_complaints"("status", "priority", "created_at" DESC, "id" DESC);
CREATE INDEX "platform_complaints_priority_created_idx"
  ON "platform_complaints"("priority", "created_at" DESC, "id" DESC);
CREATE INDEX "platform_complaints_subject_trgm_idx"
  ON "platform_complaints" USING GIN ("subject" gin_trgm_ops);
CREATE INDEX "platform_complaints_number_trgm_idx"
  ON "platform_complaints" USING GIN ("complaint_number" gin_trgm_ops);
CREATE INDEX "platform_complaint_history_complaint_time_idx"
  ON "platform_complaint_status_history"("complaint_id", "occurred_at", "id");
CREATE INDEX "logistics_deliveries_assigned_id_idx"
  ON "logistics_deliveries"("assigned_at" DESC, "id" DESC);
CREATE INDEX "logistics_deliveries_number_trgm_idx"
  ON "logistics_deliveries" USING GIN ("delivery_number" gin_trgm_ops);
CREATE INDEX "logistics_deliveries_locality_trgm_idx"
  ON "logistics_deliveries" USING GIN ("delivery_locality" gin_trgm_ops);

COMMIT;
