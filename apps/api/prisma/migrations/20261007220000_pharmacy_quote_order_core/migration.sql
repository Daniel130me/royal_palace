BEGIN;

CREATE TYPE "PharmacyQuoteStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');
CREATE TYPE "PharmacyQuoteChargeType" AS ENUM ('TAX', 'FEE');
CREATE TYPE "InventoryReservationStatus" AS ENUM ('HELD', 'RELEASED', 'CONSUMED', 'EXPIRED');
CREATE TYPE "PharmacyOrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED');

CREATE TABLE "pharmacy_quotes" (
  "id" UUID NOT NULL,
  "quote_number" VARCHAR(64) NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_route_id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "fill_number" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "subtotal_minor" BIGINT NOT NULL,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "fee_minor" BIGINT NOT NULL DEFAULT 0,
  "total_minor" BIGINT NOT NULL,
  "status" "PharmacyQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_by_principal_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_quotes_quote_number_key" UNIQUE ("quote_number"),
  CONSTRAINT "pharmacy_quotes_amounts_check" CHECK (
    "subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "fee_minor" >= 0
    AND "total_minor" = "subtotal_minor" + "tax_minor" + "fee_minor"
    AND "total_minor" > 0
  ),
  CONSTRAINT "pharmacy_quotes_fill_number_check" CHECK ("fill_number" BETWEEN 0 AND 99),
  CONSTRAINT "pharmacy_quotes_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "pharmacy_quotes_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "pharmacy_quotes_status_dates_check" CHECK (
    ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "accepted_at" IS NULL AND "cancelled_at" IS NOT NULL)
    OR ("status" IN ('ACTIVE', 'EXPIRED', 'SUPERSEDED') AND "accepted_at" IS NULL AND "cancelled_at" IS NULL)
  ),
  CONSTRAINT "pharmacy_quotes_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quotes_prescription_route_id_fkey" FOREIGN KEY ("prescription_route_id") REFERENCES "prescription_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quotes_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quotes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quotes_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_quote_lines" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "prescription_item_id" UUID NOT NULL,
  "substitution_proposal_id" UUID,
  "line_number" INTEGER NOT NULL,
  "medication_code" VARCHAR(120),
  "medication_code_system" VARCHAR(255),
  "medication_name" VARCHAR(240) NOT NULL,
  "strength" VARCHAR(120),
  "quantity" DECIMAL(12,3) NOT NULL,
  "quantity_unit" VARCHAR(64) NOT NULL,
  "unit_price_minor" BIGINT NOT NULL,
  "line_subtotal_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_quote_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_quote_lines_quote_line_key" UNIQUE ("quote_id", "line_number"),
  CONSTRAINT "pharmacy_quote_lines_quote_item_key" UNIQUE ("quote_id", "prescription_item_id"),
  CONSTRAINT "pharmacy_quote_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "pharmacy_quote_lines_amounts_check" CHECK (
    "unit_price_minor" >= 0 AND "line_subtotal_minor" >= 0
    AND "line_subtotal_minor" = "unit_price_minor" * "quantity"
  ),
  CONSTRAINT "pharmacy_quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "pharmacy_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quote_lines_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_quote_lines_substitution_proposal_id_fkey" FOREIGN KEY ("substitution_proposal_id") REFERENCES "prescription_substitution_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_quote_charges" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "type" "PharmacyQuoteChargeType" NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_quote_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_quote_charges_quote_type_code_key" UNIQUE ("quote_id", "type", "code"),
  CONSTRAINT "pharmacy_quote_charges_amount_check" CHECK ("amount_minor" >= 0),
  CONSTRAINT "pharmacy_quote_charges_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "pharmacy_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "inventory_reservations" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "provider_code" VARCHAR(64) NOT NULL,
  "provider_reservation_reference" VARCHAR(255),
  "evidence_hash" CHAR(64) NOT NULL,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'HELD',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_quote_id_key" UNIQUE ("quote_id"),
  CONSTRAINT "inventory_reservations_provider_reservation_reference_key" UNIQUE ("provider_reservation_reference"),
  CONSTRAINT "inventory_reservations_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "inventory_reservations_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "pharmacy_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_orders" (
  "id" UUID NOT NULL,
  "order_number" VARCHAR(64) NOT NULL,
  "quote_id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_route_id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "status" "PharmacyOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "accepted_by_principal_id" UUID NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_orders_order_number_key" UNIQUE ("order_number"),
  CONSTRAINT "pharmacy_orders_quote_id_key" UNIQUE ("quote_id"),
  CONSTRAINT "pharmacy_orders_status_dates_check" CHECK (
    ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
    OR ("status" IN ('PENDING_PAYMENT', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED') AND "cancelled_at" IS NULL)
  ),
  CONSTRAINT "pharmacy_orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "pharmacy_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_orders_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_orders_prescription_route_id_fkey" FOREIGN KEY ("prescription_route_id") REFERENCES "prescription_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_orders_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_orders_accepted_by_principal_id_fkey" FOREIGN KEY ("accepted_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "payments"
  ALTER COLUMN "appointment_id" DROP NOT NULL,
  ADD COLUMN "pharmacy_order_id" UUID,
  DROP CONSTRAINT "payments_current_subject_check",
  ADD CONSTRAINT "payments_pharmacy_order_id_key" UNIQUE ("pharmacy_order_id"),
  ADD CONSTRAINT "payments_pharmacy_order_id_fkey" FOREIGN KEY ("pharmacy_order_id") REFERENCES "pharmacy_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_subject_check" CHECK (
    ("purpose" = 'CONSULTATION' AND "appointment_id" IS NOT NULL AND "pharmacy_order_id" IS NULL)
    OR ("purpose" = 'PHARMACY_ORDER' AND "appointment_id" IS NULL AND "pharmacy_order_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "pharmacy_quotes_active_route_fill_key"
  ON "pharmacy_quotes"("prescription_route_id", "fill_number") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "pharmacy_quotes_accepted_route_fill_key"
  ON "pharmacy_quotes"("prescription_route_id", "fill_number") WHERE "status" = 'ACCEPTED';
CREATE INDEX "pharmacy_quotes_patient_created_idx" ON "pharmacy_quotes"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_quotes_org_status_expiry_idx" ON "pharmacy_quotes"("pharmacy_organization_id", "status", "expires_at", "id");
CREATE INDEX "pharmacy_quotes_route_fill_created_idx" ON "pharmacy_quotes"("prescription_route_id", "fill_number", "created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_quotes_expiry_idx" ON "pharmacy_quotes"("status", "expires_at", "id");
CREATE INDEX "pharmacy_quote_lines_item_created_idx" ON "pharmacy_quote_lines"("prescription_item_id", "created_at", "id");
CREATE INDEX "pharmacy_quote_lines_substitution_idx" ON "pharmacy_quote_lines"("substitution_proposal_id", "created_at", "id");
CREATE INDEX "pharmacy_quote_charges_quote_type_idx" ON "pharmacy_quote_charges"("quote_id", "type", "id");
CREATE INDEX "inventory_reservations_status_expiry_idx" ON "inventory_reservations"("status", "expires_at", "id");
CREATE INDEX "pharmacy_orders_patient_created_idx" ON "pharmacy_orders"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_orders_org_status_created_idx" ON "pharmacy_orders"("pharmacy_organization_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_orders_prescription_created_idx" ON "pharmacy_orders"("prescription_id", "created_at" DESC, "id" DESC);

CREATE OR REPLACE FUNCTION prevent_pharmacy_quote_snapshot_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."quote_number" IS DISTINCT FROM NEW."quote_number"
     OR OLD."prescription_id" IS DISTINCT FROM NEW."prescription_id"
     OR OLD."prescription_route_id" IS DISTINCT FROM NEW."prescription_route_id"
     OR OLD."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
     OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."fill_number" IS DISTINCT FROM NEW."fill_number"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."subtotal_minor" IS DISTINCT FROM NEW."subtotal_minor"
     OR OLD."tax_minor" IS DISTINCT FROM NEW."tax_minor"
     OR OLD."fee_minor" IS DISTINCT FROM NEW."fee_minor"
     OR OLD."total_minor" IS DISTINCT FROM NEW."total_minor"
     OR OLD."expires_at" IS DISTINCT FROM NEW."expires_at"
     OR OLD."created_by_principal_id" IS DISTINCT FROM NEW."created_by_principal_id" THEN
    RAISE EXCEPTION 'pharmacy quote commercial snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_quotes_snapshot_immutable"
BEFORE UPDATE ON "pharmacy_quotes"
FOR EACH ROW EXECUTE FUNCTION prevent_pharmacy_quote_snapshot_change();

CREATE OR REPLACE FUNCTION enforce_pharmacy_quote_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('ACCEPTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'invalid pharmacy quote state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_quotes_state_transition_guard"
BEFORE UPDATE OF "status" ON "pharmacy_quotes"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_quote_state_transition();

CREATE OR REPLACE FUNCTION prevent_immutable_row_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable commercial evidence cannot be changed or deleted';
END $$;

CREATE TRIGGER "pharmacy_quote_lines_immutable"
BEFORE UPDATE OR DELETE ON "pharmacy_quote_lines"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();
CREATE TRIGGER "pharmacy_quote_charges_immutable"
BEFORE UPDATE OR DELETE ON "pharmacy_quote_charges"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();

CREATE OR REPLACE FUNCTION validate_pharmacy_quote_aggregate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_quote_id UUID;
DECLARE quote_record RECORD;
DECLARE line_record RECORD;
DECLARE charge_record RECORD;
DECLARE reservation_record RECORD;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_quotes' THEN
    target_quote_id := NEW."id";
  ELSE
    target_quote_id := NEW."quote_id";
  END IF;
  SELECT "subtotal_minor", "tax_minor", "fee_minor", "total_minor", "expires_at"
    INTO quote_record FROM "pharmacy_quotes" WHERE "id" = target_quote_id;
  SELECT COUNT(*) AS line_count, COALESCE(SUM("line_subtotal_minor"), 0) AS subtotal_minor
    INTO line_record FROM "pharmacy_quote_lines" WHERE "quote_id" = target_quote_id;
  SELECT
      COALESCE(SUM("amount_minor") FILTER (WHERE "type" = 'TAX'), 0) AS tax_minor,
      COALESCE(SUM("amount_minor") FILTER (WHERE "type" = 'FEE'), 0) AS fee_minor
    INTO charge_record FROM "pharmacy_quote_charges" WHERE "quote_id" = target_quote_id;
  SELECT COUNT(*) AS reservation_count, MIN("expires_at") AS expires_at
    INTO reservation_record FROM "inventory_reservations" WHERE "quote_id" = target_quote_id;
  IF quote_record IS NULL
     OR line_record.line_count < 1
     OR quote_record."subtotal_minor" IS DISTINCT FROM line_record.subtotal_minor
     OR quote_record."tax_minor" IS DISTINCT FROM charge_record.tax_minor
     OR quote_record."fee_minor" IS DISTINCT FROM charge_record.fee_minor
     OR quote_record."total_minor" IS DISTINCT FROM
        line_record.subtotal_minor + charge_record.tax_minor + charge_record.fee_minor
     OR reservation_record.reservation_count <> 1
     OR quote_record."expires_at" IS DISTINCT FROM reservation_record.expires_at THEN
    RAISE EXCEPTION 'pharmacy quote aggregate totals or reservation evidence are inconsistent';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "pharmacy_quotes_aggregate_guard"
AFTER INSERT OR UPDATE ON "pharmacy_quotes"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_quote_aggregate();
CREATE CONSTRAINT TRIGGER "pharmacy_quote_lines_aggregate_guard"
AFTER INSERT ON "pharmacy_quote_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_quote_aggregate();
CREATE CONSTRAINT TRIGGER "pharmacy_quote_charges_aggregate_guard"
AFTER INSERT ON "pharmacy_quote_charges"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_quote_aggregate();

CREATE OR REPLACE FUNCTION prevent_inventory_reservation_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."quote_id" IS DISTINCT FROM NEW."quote_id"
     OR OLD."provider_code" IS DISTINCT FROM NEW."provider_code"
     OR OLD."provider_reservation_reference" IS DISTINCT FROM NEW."provider_reservation_reference"
     OR OLD."evidence_hash" IS DISTINCT FROM NEW."evidence_hash"
     OR OLD."expires_at" IS DISTINCT FROM NEW."expires_at" THEN
    RAISE EXCEPTION 'inventory reservation identity and evidence are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "inventory_reservations_identity_immutable"
BEFORE UPDATE ON "inventory_reservations"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_reservation_identity_change();
CREATE CONSTRAINT TRIGGER "inventory_reservations_quote_aggregate_guard"
AFTER INSERT ON "inventory_reservations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_quote_aggregate();

CREATE OR REPLACE FUNCTION enforce_inventory_reservation_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF OLD."status" <> 'HELD' OR NEW."status" NOT IN ('RELEASED', 'CONSUMED', 'EXPIRED') THEN
    RAISE EXCEPTION 'invalid inventory reservation state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "inventory_reservations_state_transition_guard"
BEFORE UPDATE OF "status" ON "inventory_reservations"
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_reservation_state_transition();

CREATE OR REPLACE FUNCTION prevent_pharmacy_order_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."order_number" IS DISTINCT FROM NEW."order_number"
     OR OLD."quote_id" IS DISTINCT FROM NEW."quote_id"
     OR OLD."prescription_id" IS DISTINCT FROM NEW."prescription_id"
     OR OLD."prescription_route_id" IS DISTINCT FROM NEW."prescription_route_id"
     OR OLD."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
     OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."accepted_by_principal_id" IS DISTINCT FROM NEW."accepted_by_principal_id"
     OR OLD."accepted_at" IS DISTINCT FROM NEW."accepted_at" THEN
    RAISE EXCEPTION 'pharmacy order identity is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_orders_identity_immutable"
BEFORE UPDATE ON "pharmacy_orders"
FOR EACH ROW EXECUTE FUNCTION prevent_pharmacy_order_identity_change();

CREATE OR REPLACE FUNCTION enforce_pharmacy_order_quote_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote_record RECORD;
DECLARE patient_record RECORD;
BEGIN
  SELECT "prescription_id", "prescription_route_id", "pharmacy_organization_id", "patient_id", "status"
    INTO quote_record FROM "pharmacy_quotes" WHERE "id" = NEW."quote_id";
  SELECT "principal_id" INTO patient_record FROM "patients" WHERE "id" = NEW."patient_id";
  IF quote_record IS NULL
     OR quote_record."status" <> 'ACCEPTED'
     OR quote_record."prescription_id" IS DISTINCT FROM NEW."prescription_id"
     OR quote_record."prescription_route_id" IS DISTINCT FROM NEW."prescription_route_id"
     OR quote_record."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
     OR quote_record."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR patient_record IS NULL
     OR patient_record."principal_id" IS DISTINCT FROM NEW."accepted_by_principal_id" THEN
    RAISE EXCEPTION 'pharmacy order must exactly match an accepted patient-owned quote';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_orders_quote_scope_guard"
BEFORE INSERT ON "pharmacy_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_order_quote_scope();

CREATE OR REPLACE FUNCTION enforce_pharmacy_order_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = NEW."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'PENDING_PAYMENT' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('CANCELLED', 'REFUND_PENDING', 'DISPUTED'))
    OR (OLD."status" = 'CANCELLED' AND NEW."status" = 'REFUND_PENDING')
    OR (OLD."status" = 'REFUND_PENDING' AND NEW."status" IN ('REFUNDED', 'DISPUTED'))
  ) THEN
    RAISE EXCEPTION 'invalid pharmacy order state transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_orders_state_transition_guard"
BEFORE UPDATE OF "status" ON "pharmacy_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_pharmacy_order_state_transition();

CREATE OR REPLACE FUNCTION enforce_payment_appointment_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appointment_record RECORD;
DECLARE order_record RECORD;
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
