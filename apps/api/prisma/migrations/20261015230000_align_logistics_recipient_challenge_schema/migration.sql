BEGIN;

ALTER TABLE "logistics_recipient_code_challenges"
  DROP CONSTRAINT "logistics_recipient_challenges_delivery_fkey";

ALTER TABLE "logistics_recipient_code_challenges"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "logistics_recipient_code_challenges"
  ADD CONSTRAINT "logistics_recipient_code_challenges_delivery_id_fkey"
  FOREIGN KEY ("delivery_id")
  REFERENCES "logistics_deliveries"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

COMMIT;
