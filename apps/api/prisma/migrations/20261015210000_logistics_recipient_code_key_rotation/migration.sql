BEGIN;

ALTER TABLE "logistics_deliveries"
  ADD COLUMN "recipient_code_key_id" VARCHAR(64);

-- The dispatch API did not exist before this migration. The marker preserves only
-- synthetic migration-verifier rows; it is never accepted for code verification.
UPDATE "logistics_deliveries"
SET "recipient_code_key_id" = 'pre-11e2-unavailable'
WHERE "recipient_code_key_id" IS NULL;

ALTER TABLE "logistics_deliveries"
  ALTER COLUMN "recipient_code_key_id" SET NOT NULL;

CREATE FUNCTION enforce_logistics_recipient_code_key_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."recipient_code_key_id" IS DISTINCT FROM OLD."recipient_code_key_id" THEN
    RAISE EXCEPTION 'Logistics recipient code key identifier is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "logistics_recipient_code_key_immutable"
BEFORE UPDATE ON "logistics_deliveries"
FOR EACH ROW EXECUTE FUNCTION enforce_logistics_recipient_code_key_immutable();

COMMIT;
