BEGIN;

CREATE TYPE "ServicePriceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

CREATE TABLE "service_prices" (
  "id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "patient_price_minor" BIGINT NOT NULL,
  "provider_payout_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_until" TIMESTAMPTZ(6),
  "status" "ServicePriceStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_principal_id" UUID NOT NULL,
  "approved_by_principal_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_prices_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_prices_approved_by_principal_id_fkey" FOREIGN KEY ("approved_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_prices_amounts_check" CHECK (
    "patient_price_minor" > 0
    AND "provider_payout_minor" >= 0
    AND "provider_payout_minor" <= "patient_price_minor"
  ),
  CONSTRAINT "service_prices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "service_prices_validity_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  CONSTRAINT "service_prices_approval_check" CHECK (
    ("status" = 'DRAFT' AND "approved_by_principal_id" IS NULL)
    OR ("status" IN ('ACTIVE', 'RETIRED') AND "approved_by_principal_id" IS NOT NULL)
  )
);

CREATE INDEX "service_prices_active_lookup_idx"
  ON "service_prices"("service_id", "status", "effective_from", "id");
CREATE UNIQUE INDEX "service_prices_one_active_per_service_idx"
  ON "service_prices"("service_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "laboratory_bookings"
  ADD COLUMN "service_price_id" UUID,
  ADD COLUMN "patient_price_minor" BIGINT,
  ADD COLUMN "laboratory_payout_minor" BIGINT,
  ADD COLUMN "currency" CHAR(3),
  ADD CONSTRAINT "laboratory_bookings_service_price_id_fkey" FOREIGN KEY ("service_price_id") REFERENCES "service_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "laboratory_bookings_commercial_snapshot_check" CHECK (
    ("service_price_id" IS NULL AND "patient_price_minor" IS NULL AND "laboratory_payout_minor" IS NULL AND "currency" IS NULL)
    OR (
      "service_price_id" IS NOT NULL
      AND "patient_price_minor" > 0
      AND "laboratory_payout_minor" >= 0
      AND "laboratory_payout_minor" <= "patient_price_minor"
      AND "currency" ~ '^[A-Z]{3}$'
    )
  );

ALTER TABLE "payments"
  ADD COLUMN "laboratory_booking_id" UUID,
  ADD CONSTRAINT "payments_laboratory_booking_id_key" UNIQUE ("laboratory_booking_id"),
  ADD CONSTRAINT "payments_laboratory_booking_id_fkey" FOREIGN KEY ("laboratory_booking_id") REFERENCES "laboratory_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  DROP CONSTRAINT "payments_subject_check",
  ADD CONSTRAINT "payments_subject_check" CHECK (
    ("purpose" = 'CONSULTATION' AND "appointment_id" IS NOT NULL AND "pharmacy_order_id" IS NULL AND "laboratory_booking_id" IS NULL)
    OR ("purpose" = 'PHARMACY_ORDER' AND "appointment_id" IS NULL AND "pharmacy_order_id" IS NOT NULL AND "laboratory_booking_id" IS NULL)
    OR ("purpose" = 'LABORATORY_BOOKING' AND "appointment_id" IS NULL AND "pharmacy_order_id" IS NULL AND "laboratory_booking_id" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION prevent_service_price_commercial_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."service_id" IS DISTINCT FROM NEW."service_id"
     OR OLD."patient_price_minor" IS DISTINCT FROM NEW."patient_price_minor"
     OR OLD."provider_payout_minor" IS DISTINCT FROM NEW."provider_payout_minor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."effective_from" IS DISTINCT FROM NEW."effective_from"
     OR OLD."effective_until" IS DISTINCT FROM NEW."effective_until"
     OR OLD."created_by_principal_id" IS DISTINCT FROM NEW."created_by_principal_id" THEN
    RAISE EXCEPTION 'service price commercial terms are immutable; create a replacement price';
  END IF;
  IF OLD."status" IN ('ACTIVE', 'RETIRED') AND OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" <> 'RETIRED' THEN
    RAISE EXCEPTION 'approved service price cannot be reactivated';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "service_prices_commercial_immutable"
BEFORE UPDATE ON "service_prices"
FOR EACH ROW EXECUTE FUNCTION prevent_service_price_commercial_change();

CREATE OR REPLACE FUNCTION enforce_laboratory_booking_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE price_record RECORD;
DECLARE request_service_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."service_price_id" IS DISTINCT FROM NEW."service_price_id"
       OR OLD."patient_price_minor" IS DISTINCT FROM NEW."patient_price_minor"
       OR OLD."laboratory_payout_minor" IS DISTINCT FROM NEW."laboratory_payout_minor"
       OR OLD."currency" IS DISTINCT FROM NEW."currency" THEN
      RAISE EXCEPTION 'laboratory booking commercial snapshot is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."service_price_id" IS NULL THEN
    RAISE EXCEPTION 'new laboratory bookings require an approved commercial snapshot';
  END IF;
  SELECT "service_id" INTO request_service_id FROM "laboratory_requests" WHERE "id" = NEW."request_id";
  SELECT "service_id", "patient_price_minor", "provider_payout_minor", "currency", "status",
         "effective_from", "effective_until"
    INTO price_record FROM "service_prices" WHERE "id" = NEW."service_price_id";
  IF price_record IS NULL
     OR price_record."service_id" IS DISTINCT FROM request_service_id
     OR price_record."status" <> 'ACTIVE'
     OR price_record."effective_from" > NEW."accepted_at"
     OR (price_record."effective_until" IS NOT NULL AND price_record."effective_until" <= NEW."accepted_at")
     OR price_record."patient_price_minor" IS DISTINCT FROM NEW."patient_price_minor"
     OR price_record."provider_payout_minor" IS DISTINCT FROM NEW."laboratory_payout_minor"
     OR price_record."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'laboratory booking must be an exact snapshot of an active service price';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "laboratory_bookings_snapshot_guard"
BEFORE INSERT OR UPDATE ON "laboratory_bookings"
FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_booking_snapshot();

CREATE OR REPLACE FUNCTION enforce_payment_appointment_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appointment_record RECORD;
DECLARE order_record RECORD;
DECLARE laboratory_record RECORD;
BEGIN
  IF NEW."purpose" = 'CONSULTATION' THEN
    SELECT "patient_id", "amount_minor", "currency" INTO appointment_record
      FROM "appointments" WHERE "id" = NEW."appointment_id";
    IF appointment_record IS NULL
       OR appointment_record."patient_id" IS DISTINCT FROM NEW."patient_id"
       OR appointment_record."amount_minor" IS DISTINCT FROM NEW."amount_minor"
       OR appointment_record."currency" IS DISTINCT FROM NEW."currency" THEN
      RAISE EXCEPTION 'payment must be an exact commercial snapshot of its appointment';
    END IF;
  ELSIF NEW."purpose" = 'PHARMACY_ORDER' THEN
    SELECT orders."patient_id", quotes."total_minor", quotes."currency", quotes."expires_at"
      INTO order_record
      FROM "pharmacy_orders" orders
      JOIN "pharmacy_quotes" quotes ON quotes."id" = orders."quote_id"
     WHERE orders."id" = NEW."pharmacy_order_id";
    IF order_record IS NULL
       OR order_record."patient_id" IS DISTINCT FROM NEW."patient_id"
       OR order_record."total_minor" IS DISTINCT FROM NEW."amount_minor"
       OR order_record."currency" IS DISTINCT FROM NEW."currency"
       OR order_record."expires_at" IS DISTINCT FROM NEW."payable_until" THEN
      RAISE EXCEPTION 'payment must be an exact commercial snapshot of its pharmacy order';
    END IF;
  ELSIF NEW."purpose" = 'LABORATORY_BOOKING' THEN
    SELECT requests."patient_id", bookings."patient_price_minor", bookings."currency"
      INTO laboratory_record
      FROM "laboratory_bookings" bookings
      JOIN "laboratory_requests" requests ON requests."id" = bookings."request_id"
     WHERE bookings."id" = NEW."laboratory_booking_id";
    IF laboratory_record IS NULL
       OR laboratory_record."patient_id" IS DISTINCT FROM NEW."patient_id"
       OR laboratory_record."patient_price_minor" IS DISTINCT FROM NEW."amount_minor"
       OR laboratory_record."currency" IS DISTINCT FROM NEW."currency" THEN
      RAISE EXCEPTION 'payment must be an exact commercial snapshot of its laboratory booking';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported payment purpose';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_payment_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."appointment_id" IS DISTINCT FROM NEW."appointment_id"
     OR OLD."pharmacy_order_id" IS DISTINCT FROM NEW."pharmacy_order_id"
     OR OLD."laboratory_booking_id" IS DISTINCT FROM NEW."laboratory_booking_id"
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
