BEGIN;

-- Replace the initial booking guard so a laboratory can accept only a service that
-- is active in both the platform taxonomy and that laboratory's own catalogue.
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

  SELECT request."status", (offering."id" IS NOT NULL) AS "service_is_offered"
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
  RETURN NEW;
END $$;

COMMIT;
