BEGIN;

-- Match Prisma's deterministic constraint names without rewriting the already
-- published upload migration or changing any referential behavior.
ALTER TABLE "pharmacy_quotes"
  RENAME CONSTRAINT "pharmacy_quotes_scanned_prescription_fkey"
  TO "pharmacy_quotes_scanned_prescription_id_fkey";

ALTER TABLE "scanned_prescription_status_history"
  RENAME CONSTRAINT "scanned_prescription_history_actor_fkey"
  TO "scanned_prescription_status_history_actor_principal_id_fkey";

ALTER TABLE "scanned_prescription_status_history"
  RENAME CONSTRAINT "scanned_prescription_history_upload_fkey"
  TO "scanned_prescription_status_history_scanned_prescription_i_fkey";

ALTER TABLE "scanned_prescriptions"
  RENAME CONSTRAINT "scanned_prescriptions_patient_fkey"
  TO "scanned_prescriptions_patient_id_fkey";

ALTER TABLE "scanned_prescriptions"
  RENAME CONSTRAINT "scanned_prescriptions_pharmacy_fkey"
  TO "scanned_prescriptions_pharmacy_organization_id_fkey";

COMMIT;
