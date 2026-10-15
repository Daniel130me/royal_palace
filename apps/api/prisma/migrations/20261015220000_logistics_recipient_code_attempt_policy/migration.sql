BEGIN;

CREATE TABLE "logistics_recipient_code_challenges" (
  "delivery_id" UUID NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "attempt_window_started_at" TIMESTAMPTZ(6),
  "locked_until" TIMESTAMPTZ(6),
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "logistics_recipient_code_challenges_pkey" PRIMARY KEY ("delivery_id"),
  CONSTRAINT "logistics_recipient_challenges_attempts_check" CHECK ("failed_attempts" >= 0),
  CONSTRAINT "logistics_recipient_challenges_version_check" CHECK ("version" > 0),
  CONSTRAINT "logistics_recipient_challenges_window_check" CHECK (
    ("failed_attempts" = 0 AND "attempt_window_started_at" IS NULL)
    OR ("failed_attempts" > 0 AND "attempt_window_started_at" IS NOT NULL)
  ),
  CONSTRAINT "logistics_recipient_challenges_lock_check" CHECK (
    "locked_until" IS NULL OR "attempt_window_started_at" IS NOT NULL
  ),
  CONSTRAINT "logistics_recipient_challenges_delivery_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "logistics_deliveries"("id") ON DELETE RESTRICT
);

CREATE INDEX "logistics_recipient_challenges_locked_idx"
  ON "logistics_recipient_code_challenges"("locked_until", "delivery_id");

INSERT INTO "logistics_recipient_code_challenges" ("delivery_id")
SELECT "id" FROM "logistics_deliveries";

CREATE FUNCTION enforce_logistics_recipient_challenge_update()
RETURNS trigger AS $$
BEGIN
  IF NEW."delivery_id" IS DISTINCT FROM OLD."delivery_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."version" <> OLD."version" + 1
    OR (OLD."verified_at" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
    OR (NEW."verified_at" IS DISTINCT FROM OLD."verified_at" AND OLD."verified_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'Logistics recipient-code challenge update is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION prevent_logistics_recipient_challenge_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Logistics recipient-code challenge cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "logistics_recipient_challenges_update_guard"
  BEFORE UPDATE ON "logistics_recipient_code_challenges"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_recipient_challenge_update();
CREATE TRIGGER "logistics_recipient_challenges_delete_guard"
  BEFORE DELETE ON "logistics_recipient_code_challenges"
  FOR EACH ROW EXECUTE FUNCTION prevent_logistics_recipient_challenge_delete();

CREATE OR REPLACE FUNCTION enforce_logistics_proof()
RETURNS trigger AS $$
DECLARE
  delivery_status "LogisticsDeliveryStatus";
  code_expiry TIMESTAMPTZ(6);
  assigned_organization_id UUID;
  challenge_verified_at TIMESTAMPTZ(6);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Logistics delivery proof is immutable';
  END IF;
  SELECT delivery."status", delivery."recipient_code_expires_at",
         delivery."logistics_organization_id", challenge."verified_at"
    INTO delivery_status, code_expiry, assigned_organization_id, challenge_verified_at
  FROM "logistics_deliveries" delivery
  JOIN "logistics_recipient_code_challenges" challenge
    ON challenge."delivery_id" = delivery."id"
  WHERE delivery."id" = NEW."delivery_id";
  IF delivery_status IS DISTINCT FROM 'ARRIVED_AT_DESTINATION'
    OR NEW."verified_at" > code_expiry
    OR challenge_verified_at IS DISTINCT FROM NEW."verified_at" THEN
    RAISE EXCEPTION 'Delivery proof requires a verified, unexpired recipient-code challenge';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "memberships" membership
    JOIN "role_assignments" role_assignment ON role_assignment."membership_id" = membership."id"
    WHERE membership."organization_id" = assigned_organization_id
      AND membership."principal_id" = NEW."recorded_by_principal_id"
      AND membership."effective_until" IS NULL
      AND role_assignment."effective_until" IS NULL
      AND role_assignment."role" IN ('LOGISTICS', 'ORGANIZATION_STAFF', 'ORGANIZATION_ADMIN')
  ) THEN
    RAISE EXCEPTION 'Delivery proof recorder requires active logistics organization membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_logistics_delivery_completeness()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "logistics_delivery_assignments" assignment
    WHERE assignment."delivery_id" = NEW."id"
      AND assignment."logistics_organization_id" = NEW."logistics_organization_id"
      AND assignment."status" = 'ACTIVE'
  ) AND NEW."status" NOT IN ('DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Active logistics delivery requires one active assignment';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "logistics_delivery_status_history" history
    WHERE history."delivery_id" = NEW."id"
      AND history."from_status" IS NULL
      AND history."to_status" = 'ASSIGNED'
  ) THEN
    RAISE EXCEPTION 'Logistics delivery requires initial status history';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "logistics_recipient_code_challenges" challenge
    WHERE challenge."delivery_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Logistics delivery requires a recipient-code challenge';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
