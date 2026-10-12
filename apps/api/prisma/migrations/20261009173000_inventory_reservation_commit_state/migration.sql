BEGIN;

-- PostgreSQL does not permit a newly added enum value to be used safely before
-- the surrounding transaction commits. Rebuild the enum instead so the type,
-- column, default, and updated transition guard remain one atomic migration.
ALTER TABLE "inventory_reservations"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "InventoryReservationStatus"
  RENAME TO "InventoryReservationStatus_previous";

CREATE TYPE "InventoryReservationStatus" AS ENUM (
  'HELD',
  'COMMITTED',
  'RELEASED',
  'CONSUMED',
  'EXPIRED'
);

ALTER TABLE "inventory_reservations"
  ALTER COLUMN "status" TYPE "InventoryReservationStatus"
    USING "status"::text::"InventoryReservationStatus",
  ALTER COLUMN "status" SET DEFAULT 'HELD';

DROP TYPE "InventoryReservationStatus_previous";

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_platform_reference_check" CHECK (
    "provider_code" <> 'PLATFORM_INVENTORY' OR "provider_reservation_reference" IS NOT NULL
  );

-- Replace the transition function installed by the quote/order migration. The
-- existing trigger keeps pointing at this function, leaving one authoritative
-- database state machine instead of multiple guards with conflicting rules.
CREATE OR REPLACE FUNCTION enforce_inventory_reservation_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF (OLD."status" = 'HELD' AND NEW."status" IN ('COMMITTED', 'RELEASED', 'EXPIRED'))
     OR (OLD."status" = 'COMMITTED' AND NEW."status" IN ('CONSUMED', 'RELEASED')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid inventory reservation status transition: % -> %', OLD."status", NEW."status";
END $$;

CREATE OR REPLACE FUNCTION validate_pharmacy_quote_catalogue_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote_org UUID;
DECLARE item_org UUID;
BEGIN
  IF NEW."catalog_item_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "pharmacy_organization_id" INTO quote_org
    FROM "pharmacy_quotes" WHERE "id" = NEW."quote_id";
  SELECT "pharmacy_organization_id" INTO item_org
    FROM "pharmacy_catalog_items" WHERE "id" = NEW."catalog_item_id";
  IF quote_org IS NULL OR item_org IS NULL OR quote_org IS DISTINCT FROM item_org THEN
    RAISE EXCEPTION 'quote catalogue item must belong to the quoting pharmacy';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_quote_lines_catalogue_scope_guard"
BEFORE INSERT OR UPDATE OF "quote_id", "catalog_item_id" ON "pharmacy_quote_lines"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_quote_catalogue_scope();

CREATE OR REPLACE FUNCTION validate_inventory_reservation_allocation_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reservation_quote UUID;
DECLARE line_record RECORD;
DECLARE lot_record RECORD;
DECLARE item_org UUID;
DECLARE quote_org UUID;
BEGIN
  SELECT "quote_id" INTO reservation_quote
    FROM "inventory_reservations" WHERE "id" = NEW."reservation_id";
  SELECT "quote_id", "catalog_item_id" INTO line_record
    FROM "pharmacy_quote_lines" WHERE "id" = NEW."quote_line_id";
  SELECT "catalog_item_id", "pharmacy_organization_id" INTO lot_record
    FROM "inventory_lots" WHERE "id" = NEW."lot_id";
  SELECT "pharmacy_organization_id" INTO item_org
    FROM "pharmacy_catalog_items" WHERE "id" = NEW."catalog_item_id";
  SELECT "pharmacy_organization_id" INTO quote_org
    FROM "pharmacy_quotes" WHERE "id" = reservation_quote;

  IF reservation_quote IS NULL
     OR line_record."quote_id" IS DISTINCT FROM reservation_quote
     OR line_record."catalog_item_id" IS DISTINCT FROM NEW."catalog_item_id"
     OR lot_record."catalog_item_id" IS DISTINCT FROM NEW."catalog_item_id"
     OR lot_record."pharmacy_organization_id" IS DISTINCT FROM quote_org
     OR item_org IS DISTINCT FROM quote_org THEN
    RAISE EXCEPTION 'inventory allocation references must belong to one quote and pharmacy aggregate';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "inventory_reservation_allocations_scope_guard"
BEFORE INSERT OR UPDATE OF "reservation_id", "quote_line_id", "catalog_item_id", "lot_id"
ON "inventory_reservation_allocations"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_allocation_scope();

CREATE OR REPLACE FUNCTION prevent_inventory_reservation_allocation_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."reservation_id" IS DISTINCT FROM OLD."reservation_id"
     OR NEW."quote_line_id" IS DISTINCT FROM OLD."quote_line_id"
     OR NEW."catalog_item_id" IS DISTINCT FROM OLD."catalog_item_id"
     OR NEW."lot_id" IS DISTINCT FROM OLD."lot_id"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
    RAISE EXCEPTION 'inventory allocation identity and reserved quantity are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "inventory_reservation_allocations_identity_guard"
BEFORE UPDATE ON "inventory_reservation_allocations"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_reservation_allocation_identity_change();

COMMIT;
