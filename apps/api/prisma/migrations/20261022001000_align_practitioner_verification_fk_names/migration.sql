BEGIN;

ALTER TABLE "practitioner_verification_history"
  RENAME CONSTRAINT "practitioner_verification_history_practitioner_fkey"
  TO "practitioner_verification_history_practitioner_id_fkey";

ALTER TABLE "practitioner_verification_history"
  RENAME CONSTRAINT "practitioner_verification_history_actor_fkey"
  TO "practitioner_verification_history_actor_principal_id_fkey";

COMMIT;
