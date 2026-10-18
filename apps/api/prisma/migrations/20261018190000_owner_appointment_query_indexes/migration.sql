BEGIN;

CREATE INDEX "appointments_patient_starts_idx"
ON "appointments" ("patient_id", "starts_at", "id");

COMMIT;
