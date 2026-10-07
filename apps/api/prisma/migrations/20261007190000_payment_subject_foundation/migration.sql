BEGIN;

CREATE TYPE "PaymentPurpose" AS ENUM ('CONSULTATION', 'PHARMACY_ORDER');

ALTER TABLE "payments"
  ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'CONSULTATION',
  ADD COLUMN "payable_until" TIMESTAMPTZ(6);

UPDATE "payments" AS payment
SET "payable_until" = appointment."payment_due_at"
FROM "appointments" AS appointment
WHERE appointment."id" = payment."appointment_id";

ALTER TABLE "payments"
  ALTER COLUMN "payable_until" SET NOT NULL,
  ADD CONSTRAINT "payments_current_subject_check"
    CHECK ("purpose" = 'CONSULTATION' AND "appointment_id" IS NOT NULL);

CREATE INDEX "payments_purpose_payable_idx"
  ON "payments"("purpose", "status", "payable_until", "id");

CREATE OR REPLACE FUNCTION prevent_payment_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."appointment_id" IS DISTINCT FROM NEW."appointment_id"
     OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
     OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."reference" IS DISTINCT FROM NEW."reference"
     OR OLD."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."payable_until" IS DISTINCT FROM NEW."payable_until" THEN
    RAISE EXCEPTION 'payment subject, ownership, amount, and payable period are immutable';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
