BEGIN;

CREATE TYPE "LogisticsDeliveryStatus" AS ENUM (
  'ASSIGNED', 'ACCEPTED', 'HEADING_TO_PICKUP', 'ARRIVED_AT_PICKUP',
  'PICKUP_VERIFIED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION',
  'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'
);
CREATE TYPE "LogisticsAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "LogisticsDeliveryProofMethod" AS ENUM ('RECIPIENT_CODE');

CREATE TABLE "logistics_deliveries" (
  "id" UUID NOT NULL,
  "delivery_number" VARCHAR(64) NOT NULL,
  "order_id" UUID NOT NULL,
  "handoff_id" UUID NOT NULL,
  "logistics_organization_id" UUID NOT NULL,
  "status" "LogisticsDeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
  "pickup_location_name" VARCHAR(120) NOT NULL,
  "pickup_contact_name" VARCHAR(160) NOT NULL,
  "pickup_contact_phone_e164" VARCHAR(16) NOT NULL,
  "pickup_address_line_1" VARCHAR(200) NOT NULL,
  "pickup_address_line_2" VARCHAR(200),
  "pickup_locality" VARCHAR(120) NOT NULL,
  "pickup_administrative_area" VARCHAR(120) NOT NULL,
  "pickup_postal_code" VARCHAR(32),
  "pickup_country_code" CHAR(2) NOT NULL,
  "recipient_name" VARCHAR(160) NOT NULL,
  "recipient_phone_e164" VARCHAR(16) NOT NULL,
  "delivery_address_line_1" VARCHAR(200) NOT NULL,
  "delivery_address_line_2" VARCHAR(200),
  "delivery_locality" VARCHAR(120) NOT NULL,
  "delivery_administrative_area" VARCHAR(120) NOT NULL,
  "delivery_postal_code" VARCHAR(32),
  "delivery_country_code" CHAR(2) NOT NULL,
  "delivery_instruction" VARCHAR(500),
  "recipient_code_digest" CHAR(64) NOT NULL,
  "recipient_code_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "arrived_at_pickup_at" TIMESTAMPTZ(6),
  "pickup_verified_at" TIMESTAMPTZ(6),
  "picked_up_at" TIMESTAMPTZ(6),
  "arrived_at_destination_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "returned_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "logistics_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_deliveries_delivery_number_key" UNIQUE ("delivery_number"),
  CONSTRAINT "logistics_deliveries_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "logistics_deliveries_handoff_id_key" UNIQUE ("handoff_id"),
  CONSTRAINT "logistics_deliveries_version_check" CHECK ("version" > 0),
  CONSTRAINT "logistics_deliveries_country_code_check" CHECK (
    "pickup_country_code" ~ '^[A-Z]{2}$' AND "delivery_country_code" ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT "logistics_deliveries_phone_check" CHECK (
    "pickup_contact_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'
    AND "recipient_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT "logistics_deliveries_recipient_code_digest_check" CHECK (
    "recipient_code_digest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "logistics_deliveries_code_expiry_check" CHECK (
    "recipient_code_expires_at" > "assigned_at"
  ),
  CONSTRAINT "logistics_deliveries_terminal_timestamp_check" CHECK (
    ("status" = 'DELIVERED') = ("delivered_at" IS NOT NULL)
    AND ("status" = 'FAILED') = ("failed_at" IS NOT NULL)
    AND ("status" = 'RETURNED') = ("returned_at" IS NOT NULL)
    AND ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
  ),
  CONSTRAINT "logistics_deliveries_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "pharmacy_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_deliveries_handoff_id_fkey"
    FOREIGN KEY ("handoff_id") REFERENCES "pharmacy_order_handoffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_deliveries_logistics_organization_id_fkey"
    FOREIGN KEY ("logistics_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "logistics_delivery_assignments" (
  "id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "logistics_organization_id" UUID NOT NULL,
  "courier_principal_id" UUID,
  "status" "LogisticsAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_by_principal_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL,
  "released_at" TIMESTAMPTZ(6),
  "release_reason_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "logistics_delivery_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_delivery_assignments_version_check" CHECK ("version" > 0),
  CONSTRAINT "logistics_delivery_assignments_state_check" CHECK (
    ("status" = 'ACTIVE' AND "released_at" IS NULL AND "release_reason_code" IS NULL)
    OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "release_reason_code" IS NOT NULL)
  ),
  CONSTRAINT "logistics_delivery_assignments_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "logistics_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_delivery_assignments_logistics_organization_id_fkey"
    FOREIGN KEY ("logistics_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_delivery_assignments_courier_principal_id_fkey"
    FOREIGN KEY ("courier_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_delivery_assignments_assigned_by_principal_id_fkey"
    FOREIGN KEY ("assigned_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "logistics_delivery_status_history" (
  "id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "from_status" "LogisticsDeliveryStatus",
  "to_status" "LogisticsDeliveryStatus" NOT NULL,
  "actor_principal_id" UUID NOT NULL,
  "reason_code" VARCHAR(100),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "logistics_delivery_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_delivery_status_history_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "logistics_delivery_history_delivery_status_key" UNIQUE ("delivery_id", "to_status"),
  CONSTRAINT "logistics_delivery_status_history_reason_check" CHECK (
    "to_status" NOT IN ('FAILED', 'RETURNED', 'CANCELLED') OR "reason_code" IS NOT NULL
  ),
  CONSTRAINT "logistics_delivery_status_history_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "logistics_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_delivery_status_history_actor_principal_id_fkey"
    FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "logistics_delivery_proofs" (
  "id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "method" "LogisticsDeliveryProofMethod" NOT NULL,
  "recorded_by_principal_id" UUID NOT NULL,
  "verified_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "logistics_delivery_proofs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_delivery_proofs_delivery_id_key" UNIQUE ("delivery_id"),
  CONSTRAINT "logistics_delivery_proofs_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "logistics_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_delivery_proofs_recorded_by_principal_id_fkey"
    FOREIGN KEY ("recorded_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "logistics_assignments_one_active_delivery_key"
  ON "logistics_delivery_assignments"("delivery_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "logistics_deliveries_org_status_assigned_idx"
  ON "logistics_deliveries"("logistics_organization_id", "status", "assigned_at" DESC, "id" DESC);
CREATE INDEX "logistics_deliveries_status_assigned_idx"
  ON "logistics_deliveries"("status", "assigned_at", "id");
CREATE INDEX "logistics_deliveries_order_status_idx"
  ON "logistics_deliveries"("order_id", "status", "id");
CREATE INDEX "logistics_assignments_org_status_assigned_idx"
  ON "logistics_delivery_assignments"("logistics_organization_id", "status", "assigned_at" DESC, "id" DESC);
CREATE INDEX "logistics_assignments_courier_status_idx"
  ON "logistics_delivery_assignments"("courier_principal_id", "status", "assigned_at" DESC, "id" DESC);
CREATE INDEX "logistics_delivery_history_delivery_time_idx"
  ON "logistics_delivery_status_history"("delivery_id", "occurred_at", "id");
CREATE INDEX "logistics_delivery_proofs_verified_idx"
  ON "logistics_delivery_proofs"("verified_at" DESC, "id" DESC);

CREATE FUNCTION enforce_logistics_delivery_scope()
RETURNS trigger AS $$
DECLARE
  handoff_order_id UUID;
  handoff_method "PharmacyOrderHandoffMethod";
  organization_type "OrganizationType";
  organization_status "OrganizationStatus";
  organization_verification "VerificationStatus";
BEGIN
  SELECT "order_id", "method" INTO handoff_order_id, handoff_method
  FROM "pharmacy_order_handoffs" WHERE "id" = NEW."handoff_id";
  IF handoff_order_id IS DISTINCT FROM NEW."order_id" OR handoff_method IS DISTINCT FROM 'DELIVERY' THEN
    RAISE EXCEPTION 'Logistics delivery requires the matching delivery handoff';
  END IF;

  SELECT "type", "status", "verification_status"
    INTO organization_type, organization_status, organization_verification
  FROM "organizations" WHERE "id" = NEW."logistics_organization_id";
  IF organization_type IS DISTINCT FROM 'LOGISTICS'
    OR organization_status IS DISTINCT FROM 'ACTIVE'
    OR organization_verification IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Logistics delivery requires an active verified logistics organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_delivery_update()
RETURNS trigger AS $$
BEGIN
  IF NEW."delivery_number" IS DISTINCT FROM OLD."delivery_number"
    OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."handoff_id" IS DISTINCT FROM OLD."handoff_id"
    OR NEW."pickup_location_name" IS DISTINCT FROM OLD."pickup_location_name"
    OR NEW."pickup_contact_name" IS DISTINCT FROM OLD."pickup_contact_name"
    OR NEW."pickup_contact_phone_e164" IS DISTINCT FROM OLD."pickup_contact_phone_e164"
    OR NEW."pickup_address_line_1" IS DISTINCT FROM OLD."pickup_address_line_1"
    OR NEW."pickup_address_line_2" IS DISTINCT FROM OLD."pickup_address_line_2"
    OR NEW."pickup_locality" IS DISTINCT FROM OLD."pickup_locality"
    OR NEW."pickup_administrative_area" IS DISTINCT FROM OLD."pickup_administrative_area"
    OR NEW."pickup_postal_code" IS DISTINCT FROM OLD."pickup_postal_code"
    OR NEW."pickup_country_code" IS DISTINCT FROM OLD."pickup_country_code"
    OR NEW."recipient_name" IS DISTINCT FROM OLD."recipient_name"
    OR NEW."recipient_phone_e164" IS DISTINCT FROM OLD."recipient_phone_e164"
    OR NEW."delivery_address_line_1" IS DISTINCT FROM OLD."delivery_address_line_1"
    OR NEW."delivery_address_line_2" IS DISTINCT FROM OLD."delivery_address_line_2"
    OR NEW."delivery_locality" IS DISTINCT FROM OLD."delivery_locality"
    OR NEW."delivery_administrative_area" IS DISTINCT FROM OLD."delivery_administrative_area"
    OR NEW."delivery_postal_code" IS DISTINCT FROM OLD."delivery_postal_code"
    OR NEW."delivery_country_code" IS DISTINCT FROM OLD."delivery_country_code"
    OR NEW."delivery_instruction" IS DISTINCT FROM OLD."delivery_instruction"
    OR NEW."recipient_code_digest" IS DISTINCT FROM OLD."recipient_code_digest"
    OR NEW."recipient_code_expires_at" IS DISTINCT FROM OLD."recipient_code_expires_at"
    OR NEW."assigned_at" IS DISTINCT FROM OLD."assigned_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Logistics delivery identity and fulfilment snapshot are immutable';
  END IF;

  IF NEW."logistics_organization_id" IS DISTINCT FROM OLD."logistics_organization_id" THEN
    IF OLD."status" <> 'ASSIGNED' OR NEW."status" <> 'ASSIGNED' THEN
      RAISE EXCEPTION 'Logistics organization can change only before delivery acceptance';
    END IF;
  ELSIF OLD."status" IN ('DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED') OR NOT (
    (OLD."status" = 'ASSIGNED' AND NEW."status" IN ('ACCEPTED', 'CANCELLED'))
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('HEADING_TO_PICKUP', 'CANCELLED'))
    OR (OLD."status" = 'HEADING_TO_PICKUP' AND NEW."status" IN ('ARRIVED_AT_PICKUP', 'FAILED', 'CANCELLED'))
    OR (OLD."status" = 'ARRIVED_AT_PICKUP' AND NEW."status" IN ('PICKUP_VERIFIED', 'FAILED', 'CANCELLED'))
    OR (OLD."status" = 'PICKUP_VERIFIED' AND NEW."status" IN ('PICKED_UP', 'FAILED'))
    OR (OLD."status" = 'PICKED_UP' AND NEW."status" IN ('IN_TRANSIT', 'FAILED', 'RETURNED'))
    OR (OLD."status" = 'IN_TRANSIT' AND NEW."status" IN ('ARRIVED_AT_DESTINATION', 'FAILED', 'RETURNED'))
    OR (OLD."status" = 'ARRIVED_AT_DESTINATION' AND NEW."status" IN ('DELIVERED', 'FAILED', 'RETURNED'))
  ) THEN
    RAISE EXCEPTION 'Invalid logistics delivery transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Logistics delivery version must increment exactly once';
  END IF;
  IF NEW."status" = 'DELIVERED' AND NOT EXISTS (
    SELECT 1 FROM "logistics_delivery_proofs" proof WHERE proof."delivery_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Delivered logistics delivery requires proof';
  END IF;

  IF (NEW."accepted_at" IS DISTINCT FROM OLD."accepted_at") <> (NEW."status" = 'ACCEPTED')
    OR (NEW."arrived_at_pickup_at" IS DISTINCT FROM OLD."arrived_at_pickup_at") <> (NEW."status" = 'ARRIVED_AT_PICKUP')
    OR (NEW."pickup_verified_at" IS DISTINCT FROM OLD."pickup_verified_at") <> (NEW."status" = 'PICKUP_VERIFIED')
    OR (NEW."picked_up_at" IS DISTINCT FROM OLD."picked_up_at") <> (NEW."status" = 'PICKED_UP')
    OR (NEW."arrived_at_destination_at" IS DISTINCT FROM OLD."arrived_at_destination_at") <> (NEW."status" = 'ARRIVED_AT_DESTINATION')
    OR (NEW."delivered_at" IS DISTINCT FROM OLD."delivered_at") <> (NEW."status" = 'DELIVERED')
    OR (NEW."failed_at" IS DISTINCT FROM OLD."failed_at") <> (NEW."status" = 'FAILED')
    OR (NEW."returned_at" IS DISTINCT FROM OLD."returned_at") <> (NEW."status" = 'RETURNED')
    OR (NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at") <> (NEW."status" = 'CANCELLED') THEN
    RAISE EXCEPTION 'Logistics delivery transition timestamps do not match the target status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_assignment()
RETURNS trigger AS $$
DECLARE
  delivery_organization_id UUID;
BEGIN
  SELECT "logistics_organization_id" INTO delivery_organization_id
  FROM "logistics_deliveries" WHERE "id" = NEW."delivery_id";
  IF delivery_organization_id IS DISTINCT FROM NEW."logistics_organization_id" THEN
    RAISE EXCEPTION 'Assignment organization does not match delivery organization';
  END IF;
  IF NEW."courier_principal_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "memberships" membership
    JOIN "role_assignments" role_assignment ON role_assignment."membership_id" = membership."id"
    WHERE membership."organization_id" = NEW."logistics_organization_id"
      AND membership."principal_id" = NEW."courier_principal_id"
      AND membership."effective_until" IS NULL
      AND role_assignment."effective_until" IS NULL
      AND role_assignment."role" IN ('LOGISTICS', 'ORGANIZATION_STAFF', 'ORGANIZATION_ADMIN')
  ) THEN
    RAISE EXCEPTION 'Assigned courier requires active logistics organization membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_assignment_update()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'ACTIVE' OR NEW."status" <> 'RELEASED'
    OR NEW."delivery_id" IS DISTINCT FROM OLD."delivery_id"
    OR NEW."logistics_organization_id" IS DISTINCT FROM OLD."logistics_organization_id"
    OR NEW."courier_principal_id" IS DISTINCT FROM OLD."courier_principal_id"
    OR NEW."assigned_by_principal_id" IS DISTINCT FROM OLD."assigned_by_principal_id"
    OR NEW."assigned_at" IS DISTINCT FROM OLD."assigned_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Logistics assignment update is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_history_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Logistics delivery status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_history_insert()
RETURNS trigger AS $$
DECLARE
  current_status "LogisticsDeliveryStatus";
BEGIN
  SELECT "status" INTO current_status
  FROM "logistics_deliveries" WHERE "id" = NEW."delivery_id";
  IF current_status IS DISTINCT FROM NEW."to_status"
    OR ((NEW."from_status" IS NULL) <> (NEW."to_status" = 'ASSIGNED')) THEN
    RAISE EXCEPTION 'Logistics delivery history does not match the current delivery state';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_logistics_proof()
RETURNS trigger AS $$
DECLARE
  delivery_status "LogisticsDeliveryStatus";
  code_expiry TIMESTAMPTZ(6);
  assigned_organization_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Logistics delivery proof is immutable';
  END IF;
  SELECT delivery."status", delivery."recipient_code_expires_at",
         delivery."logistics_organization_id"
    INTO delivery_status, code_expiry, assigned_organization_id
  FROM "logistics_deliveries" delivery
  WHERE delivery."id" = NEW."delivery_id";
  IF delivery_status IS DISTINCT FROM 'ARRIVED_AT_DESTINATION'
    OR NEW."verified_at" > code_expiry THEN
    RAISE EXCEPTION 'Delivery proof requires destination arrival and an unexpired recipient code';
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

CREATE FUNCTION enforce_logistics_delivery_completeness()
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
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "logistics_deliveries_scope_guard"
  BEFORE INSERT OR UPDATE ON "logistics_deliveries"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_delivery_scope();
CREATE TRIGGER "logistics_deliveries_update_guard"
  BEFORE UPDATE ON "logistics_deliveries"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_delivery_update();
CREATE TRIGGER "logistics_assignments_insert_guard"
  BEFORE INSERT ON "logistics_delivery_assignments"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_assignment();
CREATE TRIGGER "logistics_assignments_update_guard"
  BEFORE UPDATE ON "logistics_delivery_assignments"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_assignment_update();
CREATE TRIGGER "logistics_history_update_guard"
  BEFORE UPDATE OR DELETE ON "logistics_delivery_status_history"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_history_append_only();
CREATE TRIGGER "logistics_history_insert_guard"
  BEFORE INSERT ON "logistics_delivery_status_history"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_history_insert();
CREATE TRIGGER "logistics_proofs_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "logistics_delivery_proofs"
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_proof();
CREATE CONSTRAINT TRIGGER "logistics_deliveries_completeness_guard"
  AFTER INSERT OR UPDATE ON "logistics_deliveries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_logistics_delivery_completeness();

COMMIT;
