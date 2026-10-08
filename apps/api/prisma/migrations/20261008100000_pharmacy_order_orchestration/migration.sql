BEGIN;

-- PostgreSQL records dependencies from the existing check constraint and trigger
-- function to the enum. Remove those dependants before replacing the enum, then
-- recreate stricter versions after the column has adopted the expanded type.
DROP TRIGGER "pharmacy_orders_state_transition_guard" ON "pharmacy_orders";
DROP FUNCTION enforce_pharmacy_order_state_transition();
ALTER TABLE "pharmacy_orders"
  DROP CONSTRAINT "pharmacy_orders_status_dates_check";

ALTER TYPE "PharmacyOrderStatus" RENAME TO "PharmacyOrderStatus_11c2";
CREATE TYPE "PharmacyOrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'DISPUTE_PENDING',
  'DISPUTED'
);
ALTER TABLE "pharmacy_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "pharmacy_orders"
  ALTER COLUMN "status" TYPE "PharmacyOrderStatus"
  USING "status"::text::"PharmacyOrderStatus";
ALTER TABLE "pharmacy_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
DROP TYPE "PharmacyOrderStatus_11c2";

ALTER TABLE "pharmacy_orders"
  ADD CONSTRAINT "pharmacy_orders_status_dates_check" CHECK (
    ("status" = 'PENDING_PAYMENT' AND "confirmed_at" IS NULL AND "cancelled_at" IS NULL)
    OR (
      "status" IN (
        'CONFIRMED',
        'REFUND_PENDING',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
        'DISPUTE_PENDING',
        'DISPUTED'
      )
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_at" IS NULL
    )
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
  );

CREATE TYPE "PharmacyOrderHandoffMethod" AS ENUM ('PICKUP', 'DELIVERY');
CREATE TYPE "PharmacyOrderHandoffStatus" AS ENUM ('READY', 'HANDED_OFF', 'CANCELLED');
CREATE TYPE "PharmacyOrderResolutionType" AS ENUM ('CANCELLATION', 'REFUND', 'DISPUTE');
CREATE TYPE "PharmacyOrderResolutionStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

CREATE TABLE "pharmacy_order_handoffs" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "method" "PharmacyOrderHandoffMethod" NOT NULL,
  "status" "PharmacyOrderHandoffStatus" NOT NULL DEFAULT 'READY',
  "handoff_reference" VARCHAR(64) NOT NULL,
  "prepared_by_principal_id" UUID NOT NULL,
  "prepared_at" TIMESTAMPTZ(6) NOT NULL,
  "handed_off_by_principal_id" UUID,
  "handed_off_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_order_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_order_handoffs_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "pharmacy_order_handoffs_handoff_reference_key" UNIQUE ("handoff_reference"),
  CONSTRAINT "pharmacy_order_handoffs_status_dates_check" CHECK (
    ("status" = 'READY' AND "handed_off_by_principal_id" IS NULL AND "handed_off_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'HANDED_OFF' AND "handed_off_by_principal_id" IS NOT NULL AND "handed_off_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "handed_off_by_principal_id" IS NULL AND "handed_off_at" IS NULL AND "cancelled_at" IS NOT NULL)
  ),
  CONSTRAINT "pharmacy_order_handoffs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pharmacy_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_order_handoffs_prepared_by_principal_id_fkey" FOREIGN KEY ("prepared_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_order_handoffs_handed_off_by_principal_id_fkey" FOREIGN KEY ("handed_off_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_order_resolutions" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "type" "PharmacyOrderResolutionType" NOT NULL,
  "status" "PharmacyOrderResolutionStatus" NOT NULL DEFAULT 'PENDING',
  "reason_code" VARCHAR(100) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "requested_by_principal_id" UUID NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "rejected_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_order_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_order_resolutions_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "pharmacy_order_resolutions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "pharmacy_order_resolutions_status_dates_check" CHECK (
    ("status" = 'PENDING' AND "completed_at" IS NULL AND "rejected_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "rejected_at" IS NULL)
    OR ("status" = 'REJECTED' AND "completed_at" IS NULL AND "rejected_at" IS NOT NULL)
  ),
  CONSTRAINT "pharmacy_order_resolutions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pharmacy_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_order_resolutions_requested_by_principal_id_fkey" FOREIGN KEY ("requested_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "pharmacy_order_handoffs_status_prepared_idx"
  ON "pharmacy_order_handoffs"("status", "prepared_at", "id");
CREATE INDEX "pharmacy_order_resolutions_order_status_idx"
  ON "pharmacy_order_resolutions"("order_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_order_resolutions_status_type_idx"
  ON "pharmacy_order_resolutions"("status", "type", "created_at", "id");
CREATE UNIQUE INDEX "pharmacy_order_resolutions_one_pending_key"
  ON "pharmacy_order_resolutions"("order_id") WHERE "status" = 'PENDING';

CREATE OR REPLACE FUNCTION enforce_pharmacy_order_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'PENDING_PAYMENT' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTE_PENDING', 'DISPUTED'))
    OR (OLD."status" = 'REFUND_PENDING' AND NEW."status" IN ('PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTE_PENDING', 'DISPUTED'))
    OR (OLD."status" = 'PARTIALLY_REFUNDED' AND NEW."status" IN ('REFUND_PENDING', 'REFUNDED', 'DISPUTE_PENDING', 'DISPUTED'))
    OR (OLD."status" = 'DISPUTE_PENDING' AND NEW."status" IN ('DISPUTED', 'REFUNDED'))
    OR (OLD."status" = 'DISPUTED' AND NEW."status" = 'REFUNDED')
  ) THEN
    RAISE EXCEPTION 'invalid pharmacy order state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_orders_state_transition_guard"
BEFORE UPDATE OF "status" ON "pharmacy_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_order_state_transition();

CREATE OR REPLACE FUNCTION validate_pharmacy_order_commercial_state()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment_status "PaymentStatus";
DECLARE pending_resolution "PharmacyOrderResolutionType";
BEGIN
  SELECT "status" INTO payment_status FROM "payments" WHERE "pharmacy_order_id" = NEW."id";
  SELECT "type" INTO pending_resolution
    FROM "pharmacy_order_resolutions"
   WHERE "order_id" = NEW."id" AND "status" = 'PENDING';
  IF payment_status IS NULL
     OR (NEW."status" = 'PENDING_PAYMENT' AND payment_status NOT IN ('CREATED', 'PENDING', 'FAILED'))
     OR (NEW."status" = 'CANCELLED' AND payment_status NOT IN ('CANCELLED', 'EXPIRED'))
     OR (NEW."status" = 'CONFIRMED' AND payment_status <> 'SUCCEEDED')
     OR (NEW."status" = 'REFUND_PENDING' AND (payment_status NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED') OR pending_resolution <> 'REFUND'))
     OR (NEW."status" = 'PARTIALLY_REFUNDED' AND payment_status <> 'PARTIALLY_REFUNDED')
     OR (NEW."status" = 'REFUNDED' AND payment_status NOT IN ('REFUNDED', 'REVERSED'))
     OR (NEW."status" = 'DISPUTE_PENDING' AND (payment_status NOT IN ('SUCCEEDED', 'PARTIALLY_REFUNDED') OR pending_resolution <> 'DISPUTE'))
     OR (NEW."status" = 'DISPUTED' AND payment_status <> 'DISPUTED') THEN
    RAISE EXCEPTION 'pharmacy order state must match its payment and pending resolution facts';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "pharmacy_orders_commercial_state_guard"
AFTER INSERT OR UPDATE OF "status" ON "pharmacy_orders"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_order_commercial_state();

CREATE OR REPLACE FUNCTION prevent_pharmacy_handoff_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."order_id" IS DISTINCT FROM NEW."order_id"
     OR OLD."method" IS DISTINCT FROM NEW."method"
     OR OLD."handoff_reference" IS DISTINCT FROM NEW."handoff_reference"
     OR OLD."prepared_by_principal_id" IS DISTINCT FROM NEW."prepared_by_principal_id"
     OR OLD."prepared_at" IS DISTINCT FROM NEW."prepared_at" THEN
    RAISE EXCEPTION 'pharmacy handoff identity is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_handoffs_identity_immutable"
BEFORE UPDATE ON "pharmacy_order_handoffs"
FOR EACH ROW EXECUTE FUNCTION prevent_pharmacy_handoff_identity_change();

CREATE OR REPLACE FUNCTION enforce_pharmacy_handoff_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF OLD."status" <> 'READY' OR NEW."status" NOT IN ('HANDED_OFF', 'CANCELLED') THEN
    RAISE EXCEPTION 'invalid pharmacy handoff state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_handoffs_state_transition_guard"
BEFORE UPDATE OF "status" ON "pharmacy_order_handoffs"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_handoff_state_transition();

CREATE OR REPLACE FUNCTION validate_pharmacy_handoff_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_status "PharmacyOrderStatus";
BEGIN
  SELECT "status" INTO order_status FROM "pharmacy_orders" WHERE "id" = NEW."order_id";
  IF order_status IS NULL OR order_status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'pharmacy handoff requires a confirmed order';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_handoffs_scope_guard"
BEFORE INSERT ON "pharmacy_order_handoffs"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_handoff_scope();

CREATE OR REPLACE FUNCTION validate_pharmacy_handoff_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_record RECORD;
BEGIN
  IF NEW."status" <> 'HANDED_OFF' OR OLD."status" = 'HANDED_OFF' THEN RETURN NEW; END IF;
  SELECT orders."prescription_route_id", quotes."fill_number", orders."quote_id"
    INTO order_record
    FROM "pharmacy_orders" orders
    JOIN "pharmacy_quotes" quotes ON quotes."id" = orders."quote_id"
   WHERE orders."id" = NEW."order_id" AND orders."status" = 'CONFIRMED';
  IF order_record IS NULL OR EXISTS (
    SELECT 1
      FROM "pharmacy_quote_lines" quote_lines
     WHERE quote_lines."quote_id" = order_record."quote_id"
       AND quote_lines."quantity" > COALESCE((
         SELECT SUM(dispense_lines."quantity")
           FROM "prescription_dispense_lines" dispense_lines
           JOIN "prescription_dispense_events" events
             ON events."id" = dispense_lines."dispense_event_id"
          WHERE events."route_id" = order_record."prescription_route_id"
            AND dispense_lines."fill_number" = order_record."fill_number"
            AND dispense_lines."prescription_item_id" = quote_lines."prescription_item_id"
       ), 0)
  ) THEN
    RAISE EXCEPTION 'handoff requires explicit dispense evidence for every quoted line';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_handoffs_completion_guard"
BEFORE UPDATE OF "status" ON "pharmacy_order_handoffs"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_handoff_completion();

CREATE OR REPLACE FUNCTION prevent_pharmacy_resolution_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."order_id" IS DISTINCT FROM NEW."order_id"
     OR OLD."type" IS DISTINCT FROM NEW."type"
     OR OLD."reason_code" IS DISTINCT FROM NEW."reason_code"
     OR OLD."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."requested_by_principal_id" IS DISTINCT FROM NEW."requested_by_principal_id"
     OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'pharmacy order resolution identity is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_resolutions_identity_immutable"
BEFORE UPDATE ON "pharmacy_order_resolutions"
FOR EACH ROW EXECUTE FUNCTION prevent_pharmacy_resolution_identity_change();

CREATE OR REPLACE FUNCTION enforce_pharmacy_resolution_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF OLD."status" <> 'PENDING' OR NEW."status" NOT IN ('COMPLETED', 'REJECTED') THEN
    RAISE EXCEPTION 'invalid pharmacy resolution state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_order_resolutions_state_transition_guard"
BEFORE UPDATE OF "status" ON "pharmacy_order_resolutions"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_resolution_state_transition();

COMMIT;
