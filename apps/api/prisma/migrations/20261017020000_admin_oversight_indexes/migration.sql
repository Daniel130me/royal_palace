BEGIN;

CREATE INDEX "patients_given_name_trgm_idx"
  ON "patients" USING GIN ("given_name" gin_trgm_ops);
CREATE INDEX "patients_family_name_trgm_idx"
  ON "patients" USING GIN ("family_name" gin_trgm_ops);

CREATE INDEX "appointments_starts_id_idx"
  ON "appointments" ("starts_at" DESC, "id" DESC);
CREATE INDEX "appointments_status_starts_id_idx"
  ON "appointments" ("status", "starts_at" DESC, "id" DESC);

CREATE INDEX "audit_events_occurred_id_idx"
  ON "audit_events" ("occurred_at" DESC, "id" DESC);
CREATE INDEX "audit_events_role_occurred_id_idx"
  ON "audit_events" ("effective_role", "occurred_at" DESC, "id" DESC);

COMMIT;
