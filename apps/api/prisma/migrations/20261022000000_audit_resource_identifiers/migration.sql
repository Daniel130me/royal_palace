BEGIN;

-- Audit targets include both persisted UUID entities and bounded logical resources
-- such as review queues and scheduled workflow batches. Retaining those semantic
-- identifiers makes authorization decisions intelligible without inventing fake UUIDs.
DROP INDEX "audit_events_resource_occurred_idx";

ALTER TABLE "audit_events"
  ALTER COLUMN "resource_id" TYPE VARCHAR(200)
  USING "resource_id"::text;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_resource_id_not_blank"
  CHECK (length(btrim("resource_id")) > 0);

CREATE INDEX "audit_events_resource_occurred_idx"
  ON "audit_events"("resource_type", "resource_id", "occurred_at" DESC);

COMMIT;
