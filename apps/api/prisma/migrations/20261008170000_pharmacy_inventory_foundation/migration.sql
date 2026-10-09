BEGIN;

CREATE TYPE "PharmacyProductClassificationKind" AS ENUM ('CATEGORY', 'DOSAGE_FORM');
CREATE TYPE "PharmacyCatalogItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InventoryLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InventoryLotStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'DEPLETED', 'EXPIRED', 'RECALLED');
CREATE TYPE "InventoryMovementType" AS ENUM (
  'RECEIVE', 'ADJUST_IN', 'ADJUST_OUT', 'RESERVE', 'RELEASE', 'DISPENSE', 'RETURN', 'WRITE_OFF'
);
CREATE TYPE "InventoryMovementReferenceType" AS ENUM (
  'MANUAL', 'RESERVATION', 'DISPENSE_EVENT', 'PHARMACY_ORDER'
);

CREATE TABLE "pharmacy_product_classifications" (
  "id" UUID NOT NULL,
  "kind" "PharmacyProductClassificationKind" NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_product_classifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_product_classifications_kind_code_key" UNIQUE ("kind", "code"),
  CONSTRAINT "pharmacy_product_classifications_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'),
  CONSTRAINT "pharmacy_product_classifications_version_check" CHECK ("version" > 0)
);

-- Initial controlled values preserve the signed-off prototype choices. They are
-- data, not application enums, so administrators can extend or retire them later.
INSERT INTO "pharmacy_product_classifications" ("id", "kind", "code", "name", "updated_at") VALUES
  ('018f0000-0000-7000-8000-000000000001', 'CATEGORY', 'PRESCRIPTION_MEDICINE', 'Prescription Medicine', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000002', 'CATEGORY', 'OVER_THE_COUNTER', 'Over-the-Counter', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000003', 'CATEGORY', 'MEDICAL_DEVICE', 'Medical Device', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000004', 'CATEGORY', 'SUPPLEMENT', 'Supplement', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000005', 'CATEGORY', 'PERSONAL_CARE', 'Personal Care', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000006', 'CATEGORY', 'FIRST_AID', 'First Aid', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000101', 'DOSAGE_FORM', 'TABLET', 'Tablet', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000102', 'DOSAGE_FORM', 'CAPSULE', 'Capsule', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000103', 'DOSAGE_FORM', 'SYRUP', 'Syrup', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000104', 'DOSAGE_FORM', 'INJECTION', 'Injection', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000105', 'DOSAGE_FORM', 'CREAM', 'Cream', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000106', 'DOSAGE_FORM', 'DROPS', 'Drops', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000107', 'DOSAGE_FORM', 'INHALER', 'Inhaler', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000108', 'DOSAGE_FORM', 'SUPPOSITORY', 'Suppository', CURRENT_TIMESTAMP),
  ('018f0000-0000-7000-8000-000000000109', 'DOSAGE_FORM', 'POWDER', 'Powder', CURRENT_TIMESTAMP);

CREATE TABLE "pharmacy_catalog_items" (
  "id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "medication_code" VARCHAR(120),
  "medication_code_system" VARCHAR(255),
  "name" VARCHAR(240) NOT NULL,
  "generic_name" VARCHAR(240),
  "brand_name" VARCHAR(160),
  "category_id" UUID NOT NULL,
  "dosage_form_id" UUID NOT NULL,
  "strength" VARCHAR(120),
  "manufacturer" VARCHAR(200),
  "prescription_required" BOOLEAN NOT NULL DEFAULT false,
  "controlled_medication" BOOLEAN NOT NULL DEFAULT false,
  "storage_requirements" VARCHAR(500),
  "unit_price_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "low_stock_threshold" DECIMAL(14,3) NOT NULL,
  "near_expiry_days" INTEGER NOT NULL,
  "on_hand_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reserved_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "status" "PharmacyCatalogItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_principal_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_catalog_items_org_sku_key" UNIQUE ("pharmacy_organization_id", "sku"),
  CONSTRAINT "pharmacy_catalog_items_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "pharmacy_catalog_items_amount_check" CHECK ("unit_price_minor" >= 0),
  CONSTRAINT "pharmacy_catalog_items_threshold_check" CHECK (
    "low_stock_threshold" >= 0 AND "near_expiry_days" BETWEEN 1 AND 3650
  ),
  CONSTRAINT "pharmacy_catalog_items_balance_check" CHECK (
    "on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand_quantity"
  ),
  CONSTRAINT "pharmacy_catalog_items_medication_code_check" CHECK (
    ("medication_code" IS NULL AND "medication_code_system" IS NULL)
    OR ("medication_code" IS NOT NULL AND "medication_code_system" IS NOT NULL)
  ),
  CONSTRAINT "pharmacy_catalog_items_version_check" CHECK ("version" > 0),
  CONSTRAINT "pharmacy_catalog_items_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "pharmacy_product_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_catalog_items_dosage_form_id_fkey" FOREIGN KEY ("dosage_form_id") REFERENCES "pharmacy_product_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_catalog_items_created_by_principal_id_fkey" FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "inventory_locations" (
  "id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "InventoryLocationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_locations_org_code_key" UNIQUE ("pharmacy_organization_id", "code"),
  CONSTRAINT "inventory_locations_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'),
  CONSTRAINT "inventory_locations_version_check" CHECK ("version" > 0),
  CONSTRAINT "inventory_locations_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "inventory_lots" (
  "id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "batch_number" VARCHAR(120) NOT NULL,
  "expiry_date" DATE NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "InventoryLotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "on_hand_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reserved_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_lots_item_location_batch_key" UNIQUE ("catalog_item_id", "location_id", "batch_number"),
  CONSTRAINT "inventory_lots_balance_check" CHECK (
    "on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand_quantity"
  ),
  CONSTRAINT "inventory_lots_version_check" CHECK ("version" > 0),
  CONSTRAINT "inventory_lots_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_lots_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "pharmacy_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL,
  "pharmacy_organization_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "on_hand_after" DECIMAL(14,3) NOT NULL,
  "reserved_after" DECIMAL(14,3) NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "reference_type" "InventoryMovementReferenceType" NOT NULL,
  "reference_id" UUID,
  "actor_principal_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_actor_idempotency_key" UNIQUE ("actor_principal_id", "idempotency_key"),
  CONSTRAINT "inventory_movements_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_movements_balance_check" CHECK (
    "on_hand_after" >= 0 AND "reserved_after" >= 0 AND "reserved_after" <= "on_hand_after"
  ),
  CONSTRAINT "inventory_movements_reason_code_check" CHECK ("reason_code" ~ '^[A-Z0-9][A-Z0-9._-]{1,99}$'),
  CONSTRAINT "inventory_movements_reference_check" CHECK (
    ("reference_type" = 'MANUAL' AND "reference_id" IS NULL)
    OR ("reference_type" <> 'MANUAL' AND "reference_id" IS NOT NULL)
  ),
  CONSTRAINT "inventory_movements_pharmacy_organization_id_fkey" FOREIGN KEY ("pharmacy_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "pharmacy_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_actor_principal_id_fkey" FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "pharmacy_quote_lines"
  ADD COLUMN "catalog_item_id" UUID,
  ADD CONSTRAINT "pharmacy_quote_lines_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "pharmacy_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_reservation_allocations" (
  "id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "quote_line_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "released_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "consumed_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "inventory_reservation_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservation_allocations_line_lot_key" UNIQUE ("reservation_id", "quote_line_id", "lot_id"),
  CONSTRAINT "inventory_reservation_allocations_quantity_check" CHECK (
    "quantity" > 0 AND "released_quantity" >= 0 AND "consumed_quantity" >= 0
    AND "released_quantity" + "consumed_quantity" <= "quantity"
  ),
  CONSTRAINT "inventory_reservation_allocations_version_check" CHECK ("version" > 0),
  CONSTRAINT "inventory_reservation_allocations_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_allocations_quote_line_id_fkey" FOREIGN KEY ("quote_line_id") REFERENCES "pharmacy_quote_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_allocations_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "pharmacy_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "pharmacy_product_classifications_kind_status_name_idx" ON "pharmacy_product_classifications"("kind", "status", "name", "id");
CREATE INDEX "pharmacy_catalog_items_org_status_name_idx" ON "pharmacy_catalog_items"("pharmacy_organization_id", "status", "name", "id");
CREATE INDEX "pharmacy_catalog_items_org_category_status_idx" ON "pharmacy_catalog_items"("pharmacy_organization_id", "category_id", "status", "name", "id");
CREATE INDEX "pharmacy_catalog_items_medication_code_idx" ON "pharmacy_catalog_items"("pharmacy_organization_id", "medication_code_system", "medication_code", "status");
CREATE INDEX "pharmacy_catalog_items_search_trgm_idx" ON "pharmacy_catalog_items" USING GIN ("name" gin_trgm_ops, "generic_name" gin_trgm_ops, "brand_name" gin_trgm_ops);
CREATE INDEX "inventory_locations_org_status_name_idx" ON "inventory_locations"("pharmacy_organization_id", "status", "name", "id");
CREATE INDEX "inventory_lots_org_status_expiry_idx" ON "inventory_lots"("pharmacy_organization_id", "status", "expiry_date", "id");
CREATE INDEX "inventory_lots_item_status_expiry_idx" ON "inventory_lots"("catalog_item_id", "status", "expiry_date", "id");
CREATE INDEX "inventory_lots_location_status_expiry_idx" ON "inventory_lots"("location_id", "status", "expiry_date", "id");
CREATE INDEX "inventory_movements_lot_occurred_idx" ON "inventory_movements"("lot_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "inventory_movements_org_occurred_idx" ON "inventory_movements"("pharmacy_organization_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements"("reference_type", "reference_id", "occurred_at", "id");
CREATE INDEX "pharmacy_quote_lines_catalog_item_idx" ON "pharmacy_quote_lines"("catalog_item_id", "created_at", "id");
CREATE INDEX "inventory_reservation_allocations_lot_idx" ON "inventory_reservation_allocations"("lot_id", "reservation_id", "id");
CREATE INDEX "inventory_reservation_allocations_item_idx" ON "inventory_reservation_allocations"("catalog_item_id", "reservation_id", "id");

CREATE OR REPLACE FUNCTION validate_pharmacy_inventory_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_org UUID;
DECLARE location_org UUID;
DECLARE lot_record RECORD;
BEGIN
  SELECT "pharmacy_organization_id" INTO item_org FROM "pharmacy_catalog_items" WHERE "id" = NEW."catalog_item_id";
  SELECT "pharmacy_organization_id" INTO location_org FROM "inventory_locations" WHERE "id" = NEW."location_id";
  IF TG_TABLE_NAME = 'inventory_lots' THEN
    IF item_org IS DISTINCT FROM NEW."pharmacy_organization_id" OR location_org IS DISTINCT FROM NEW."pharmacy_organization_id" THEN
      RAISE EXCEPTION 'inventory lot references must belong to one pharmacy organization';
    END IF;
  ELSE
    SELECT "pharmacy_organization_id", "catalog_item_id", "location_id" INTO lot_record
      FROM "inventory_lots" WHERE "id" = NEW."lot_id";
    IF item_org IS DISTINCT FROM NEW."pharmacy_organization_id"
       OR location_org IS DISTINCT FROM NEW."pharmacy_organization_id"
       OR lot_record."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
       OR lot_record."catalog_item_id" IS DISTINCT FROM NEW."catalog_item_id"
       OR lot_record."location_id" IS DISTINCT FROM NEW."location_id" THEN
      RAISE EXCEPTION 'inventory movement references must belong to one pharmacy aggregate';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "inventory_lots_scope_guard"
BEFORE INSERT OR UPDATE OF "pharmacy_organization_id", "catalog_item_id", "location_id" ON "inventory_lots"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_inventory_scope();

CREATE TRIGGER "inventory_movements_scope_guard"
BEFORE INSERT OR UPDATE OF "pharmacy_organization_id", "catalog_item_id", "location_id", "lot_id" ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_inventory_scope();

CREATE OR REPLACE FUNCTION prevent_inventory_movement_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory movements are immutable evidence';
END $$;

CREATE TRIGGER "inventory_movements_immutable"
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_change();

CREATE OR REPLACE FUNCTION validate_catalogue_inventory_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_item_id UUID;
DECLARE item_record RECORD;
DECLARE lot_record RECORD;
BEGIN
  target_item_id := CASE WHEN TG_TABLE_NAME = 'inventory_lots' THEN NEW."catalog_item_id" ELSE NEW."id" END;
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

CREATE CONSTRAINT TRIGGER "pharmacy_catalog_items_balance_guard"
AFTER INSERT OR UPDATE OF "on_hand_quantity", "reserved_quantity" ON "pharmacy_catalog_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_catalogue_inventory_balance();

CREATE CONSTRAINT TRIGGER "inventory_lots_balance_guard"
AFTER INSERT OR UPDATE OF "on_hand_quantity", "reserved_quantity" ON "inventory_lots"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_catalogue_inventory_balance();

CREATE OR REPLACE FUNCTION validate_pharmacy_product_classifications()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category_kind "PharmacyProductClassificationKind";
DECLARE dosage_form_kind "PharmacyProductClassificationKind";
BEGIN
  SELECT "kind" INTO category_kind FROM "pharmacy_product_classifications" WHERE "id" = NEW."category_id";
  SELECT "kind" INTO dosage_form_kind FROM "pharmacy_product_classifications" WHERE "id" = NEW."dosage_form_id";
  IF category_kind IS DISTINCT FROM 'CATEGORY' OR dosage_form_kind IS DISTINCT FROM 'DOSAGE_FORM' THEN
    RAISE EXCEPTION 'catalogue item category and dosage form classifications are invalid';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pharmacy_catalog_items_classification_guard"
BEFORE INSERT OR UPDATE OF "category_id", "dosage_form_id" ON "pharmacy_catalog_items"
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_product_classifications();

COMMIT;
