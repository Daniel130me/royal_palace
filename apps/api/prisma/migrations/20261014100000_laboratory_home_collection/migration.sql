BEGIN;

CREATE TYPE "LaboratoryCollectionMode" AS ENUM ('FACILITY', 'HOME');

ALTER TABLE "organization_services"
  ADD COLUMN "supports_home_collection" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "laboratory_bookings"
  ADD COLUMN "collection_mode" "LaboratoryCollectionMode" NOT NULL DEFAULT 'FACILITY';

CREATE TABLE "laboratory_home_collections" (
  "id" UUID PRIMARY KEY,
  "booking_id" UUID NOT NULL UNIQUE
    REFERENCES "laboratory_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(200),
  "locality" VARCHAR(100) NOT NULL,
  "administrative_area" VARCHAR(100),
  "postal_code" VARCHAR(32),
  "country_code" CHAR(2) NOT NULL,
  "collection_instructions" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "laboratory_home_collections_address_check" CHECK (
    btrim("address_line_1") <> ''
    AND btrim("locality") <> ''
    AND "country_code" ~ '^[A-Z]{2}$'
    AND ("address_line_2" IS NULL OR btrim("address_line_2") <> '')
    AND ("administrative_area" IS NULL OR btrim("administrative_area") <> '')
    AND ("postal_code" IS NULL OR btrim("postal_code") <> '')
    AND ("collection_instructions" IS NULL OR btrim("collection_instructions") <> '')
  )
);

-- Collection mode is booking identity. For home collection, the selected laboratory
-- must explicitly enable that capability for the exact requested service.
CREATE OR REPLACE FUNCTION enforce_laboratory_booking_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE laboratory_record RECORD;
DECLARE request_record RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."booking_number" IS DISTINCT FROM NEW."booking_number"
    OR OLD."request_id" IS DISTINCT FROM NEW."request_id"
    OR OLD."laboratory_organization_id" IS DISTINCT FROM NEW."laboratory_organization_id"
    OR OLD."accepted_at" IS DISTINCT FROM NEW."accepted_at"
    OR OLD."collection_mode" IS DISTINCT FROM NEW."collection_mode"
  ) THEN
    RAISE EXCEPTION 'laboratory booking identity is immutable';
  END IF;

  SELECT "type", "status", "verification_status" INTO laboratory_record
    FROM "organizations" WHERE "id" = NEW."laboratory_organization_id";
  IF laboratory_record IS NULL
     OR laboratory_record."type" <> 'LABORATORY'
     OR laboratory_record."status" <> 'ACTIVE'
     OR laboratory_record."verification_status" <> 'VERIFIED' THEN
    RAISE EXCEPTION 'laboratory booking requires an active verified laboratory';
  END IF;

  SELECT request."status",
         (offering."id" IS NOT NULL) AS "service_is_offered",
         COALESCE(offering."supports_home_collection", false) AS "home_collection_is_offered"
    INTO request_record
    FROM "laboratory_requests" AS request
    LEFT JOIN "organization_services" AS offering
      ON offering."organization_id" = NEW."laboratory_organization_id"
      AND offering."service_id" = request."service_id"
      AND offering."status" = 'ACTIVE'
    WHERE request."id" = NEW."request_id";

  IF request_record IS NULL OR request_record."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'laboratory booking requires an active laboratory request';
  END IF;
  IF NOT request_record."service_is_offered" THEN
    RAISE EXCEPTION 'laboratory booking requires an active service offered by the selected laboratory';
  END IF;
  IF NEW."collection_mode" = 'HOME' AND NOT request_record."home_collection_is_offered" THEN
    RAISE EXCEPTION 'home collection is not enabled for this laboratory service';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER "laboratory_booking_scope_guard" ON "laboratory_bookings";
CREATE TRIGGER "laboratory_booking_scope_guard"
  BEFORE INSERT OR UPDATE OF "booking_number", "request_id", "laboratory_organization_id", "accepted_at", "collection_mode"
  ON "laboratory_bookings" FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_booking_scope();

CREATE OR REPLACE FUNCTION enforce_laboratory_home_collection_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_booking_id UUID;
DECLARE target_mode "LaboratoryCollectionMode";
DECLARE home_count INTEGER;
BEGIN
  target_booking_id := CASE
    WHEN TG_TABLE_NAME = 'laboratory_bookings' THEN (to_jsonb(NEW) ->> 'id')::UUID
    ELSE (to_jsonb(NEW) ->> 'booking_id')::UUID
  END;
  SELECT "collection_mode" INTO target_mode
    FROM "laboratory_bookings" WHERE "id" = target_booking_id;
  SELECT count(*) INTO home_count
    FROM "laboratory_home_collections" WHERE "booking_id" = target_booking_id;

  IF target_mode = 'HOME' AND home_count <> 1 THEN
    RAISE EXCEPTION 'home collection booking requires one address snapshot';
  END IF;
  IF target_mode = 'FACILITY' AND home_count <> 0 THEN
    RAISE EXCEPTION 'facility collection booking cannot contain a home address snapshot';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "laboratory_booking_home_collection_shape_guard"
  AFTER INSERT OR UPDATE OF "collection_mode" ON "laboratory_bookings"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_home_collection_shape();
CREATE CONSTRAINT TRIGGER "laboratory_home_collection_shape_guard"
  AFTER INSERT OR UPDATE ON "laboratory_home_collections"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_laboratory_home_collection_shape();

CREATE OR REPLACE FUNCTION prevent_laboratory_home_collection_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'laboratory home collection address snapshots are immutable';
END $$;
CREATE TRIGGER "laboratory_home_collections_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "laboratory_home_collections"
  FOR EACH ROW EXECUTE FUNCTION prevent_laboratory_home_collection_mutation();

COMMIT;
