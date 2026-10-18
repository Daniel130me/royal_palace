BEGIN;

-- The published clinical-action migration used PostgreSQL's implicit NO ACTION
-- update behavior. Prisma's governed relations use ON UPDATE CASCADE. Align the
-- database explicitly in a forward migration so clean and upgraded environments
-- share one schema without rewriting published history.
ALTER TABLE "prescriptions" DROP CONSTRAINT "prescriptions_encounter_id_fkey";
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "laboratory_requests" DROP CONSTRAINT "laboratory_requests_encounter_id_fkey";
ALTER TABLE "laboratory_requests" ADD CONSTRAINT "laboratory_requests_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_referrals" DROP CONSTRAINT "clinical_referrals_encounter_id_fkey";
ALTER TABLE "clinical_referrals" DROP CONSTRAINT "clinical_referrals_patient_id_fkey";
ALTER TABLE "clinical_referrals" DROP CONSTRAINT "clinical_referrals_practitioner_id_fkey";
ALTER TABLE "clinical_referrals" DROP CONSTRAINT "clinical_referrals_created_by_principal_id_fkey";
ALTER TABLE "clinical_referrals" ADD CONSTRAINT "clinical_referrals_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_referrals" ADD CONSTRAINT "clinical_referrals_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_referrals" ADD CONSTRAINT "clinical_referrals_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_referrals" ADD CONSTRAINT "clinical_referrals_created_by_principal_id_fkey"
  FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_care_plans" DROP CONSTRAINT "clinical_care_plans_encounter_id_fkey";
ALTER TABLE "clinical_care_plans" DROP CONSTRAINT "clinical_care_plans_patient_id_fkey";
ALTER TABLE "clinical_care_plans" DROP CONSTRAINT "clinical_care_plans_practitioner_id_fkey";
ALTER TABLE "clinical_care_plans" DROP CONSTRAINT "clinical_care_plans_updated_by_principal_id_fkey";
ALTER TABLE "clinical_care_plans" ADD CONSTRAINT "clinical_care_plans_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_care_plans" ADD CONSTRAINT "clinical_care_plans_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_care_plans" ADD CONSTRAINT "clinical_care_plans_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_care_plans" ADD CONSTRAINT "clinical_care_plans_updated_by_principal_id_fkey"
  FOREIGN KEY ("updated_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_allergies" DROP CONSTRAINT "clinical_allergies_encounter_id_fkey";
ALTER TABLE "clinical_allergies" DROP CONSTRAINT "clinical_allergies_patient_id_fkey";
ALTER TABLE "clinical_allergies" DROP CONSTRAINT "clinical_allergies_practitioner_id_fkey";
ALTER TABLE "clinical_allergies" DROP CONSTRAINT "clinical_allergies_recorded_by_principal_id_fkey";
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_recorded_by_principal_id_fkey"
  FOREIGN KEY ("recorded_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_attachment_references" DROP CONSTRAINT "clinical_attachment_references_encounter_id_fkey";
ALTER TABLE "clinical_attachment_references" DROP CONSTRAINT "clinical_attachment_references_linked_by_principal_id_fkey";
ALTER TABLE "clinical_attachment_references" ADD CONSTRAINT "clinical_attachment_references_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_attachment_references" ADD CONSTRAINT "clinical_attachment_references_linked_by_principal_id_fkey"
  FOREIGN KEY ("linked_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
