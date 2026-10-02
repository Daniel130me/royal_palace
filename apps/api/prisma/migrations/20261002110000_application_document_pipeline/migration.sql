BEGIN;

ALTER TYPE "ApplicationDocumentStatus" ADD VALUE 'SCAN_FAILED';

ALTER TABLE "application_documents"
  DROP CONSTRAINT "application_documents_storage_state_consistent";

-- Earlier versions did not reserve a key until after upload. The secure direct-upload
-- flow needs the server-owned key in the signed request, so backfill legacy pending rows
-- before enforcing the stronger one-document/one-key identity.
UPDATE "application_documents"
SET "storage_object_key" = 'application-documents/' || "id"::text
WHERE "storage_object_key" IS NULL;

ALTER TABLE "application_documents"
  ADD COLUMN "upload_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "quarantine_version_id" VARCHAR(255),
  ADD COLUMN "clean_object_key" VARCHAR(1024),
  ADD COLUMN "clean_version_id" VARCHAR(255),
  ADD COLUMN "detected_content_type" VARCHAR(127),
  ADD COLUMN "verified_size_bytes" INTEGER,
  ADD COLUMN "verified_sha256" CHAR(64),
  ADD COLUMN "scan_lease_token" UUID,
  ADD COLUMN "scan_lease_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "scan_available_at" TIMESTAMPTZ(6),
  ADD COLUMN "scan_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scanned_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "application_documents_clean_object_key_key"
  ON "application_documents"("clean_object_key");
CREATE INDEX "application_documents_scan_queue_idx"
  ON "application_documents"("scan_available_at", "created_at", "id")
  WHERE "status" IN ('QUARANTINED', 'SCANNING');
CREATE INDEX "application_documents_scan_lease_idx"
  ON "application_documents"("scan_lease_expires_at", "id")
  WHERE "status" = 'SCANNING';
CREATE INDEX "application_documents_upload_expiry_idx"
  ON "application_documents"("upload_expires_at", "id")
  WHERE "status" = 'AWAITING_UPLOAD' AND "upload_expires_at" IS NOT NULL;

ALTER TABLE "application_documents"
  ADD CONSTRAINT "application_documents_scan_attempt_nonnegative"
    CHECK ("scan_attempt_count" >= 0),
  ADD CONSTRAINT "application_documents_storage_key_owned"
    CHECK ("storage_object_key" = 'application-documents/' || "id"::text),
  ADD CONSTRAINT "application_documents_verified_size_positive"
    CHECK ("verified_size_bytes" IS NULL OR "verified_size_bytes" > 0),
  ADD CONSTRAINT "application_documents_clean_requires_evidence"
    CHECK (
      "status" <> 'CLEAN' OR (
        "storage_object_key" IS NOT NULL AND "clean_object_key" IS NOT NULL AND
        "detected_content_type" IS NOT NULL AND "verified_size_bytes" IS NOT NULL AND
        "verified_sha256" IS NOT NULL AND "scanned_at" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "application_documents_scanning_requires_lease"
    CHECK (
      "status" <> 'SCANNING' OR
      ("scan_lease_token" IS NOT NULL AND "scan_lease_expires_at" IS NOT NULL)
    );

COMMIT;
