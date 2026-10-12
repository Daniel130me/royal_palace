BEGIN;

-- NEW is a polymorphic trigger record. A CASE expression attempts to resolve
-- fields from both table shapes and fails when the trigger fires on the
-- catalogue table, which has no catalog_item_id column. Branch statements are
-- compiled for the active trigger relation and therefore preserve one shared
-- balance validator without referencing an invalid field.
CREATE OR REPLACE FUNCTION validate_catalogue_inventory_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_item_id UUID;
DECLARE item_record RECORD;
DECLARE lot_record RECORD;
BEGIN
  IF TG_TABLE_NAME = 'inventory_lots' THEN
    target_item_id := NEW."catalog_item_id";
  ELSE
    target_item_id := NEW."id";
  END IF;

  SELECT "on_hand_quantity", "reserved_quantity" INTO item_record
    FROM "pharmacy_catalog_items" WHERE "id" = target_item_id;
  SELECT COALESCE(SUM("on_hand_quantity"), 0) AS on_hand,
         COALESCE(SUM("reserved_quantity"), 0) AS reserved
    INTO lot_record FROM "inventory_lots" WHERE "catalog_item_id" = target_item_id;
  IF item_record IS NULL
     OR item_record."on_hand_quantity" IS DISTINCT FROM lot_record.on_hand
     OR item_record."reserved_quantity" IS DISTINCT FROM lot_record.reserved THEN
    RAISE EXCEPTION 'catalogue and lot inventory balances are inconsistent';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
