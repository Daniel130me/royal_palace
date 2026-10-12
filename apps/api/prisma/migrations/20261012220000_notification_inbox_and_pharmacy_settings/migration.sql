BEGIN;

CREATE TABLE "notification_inbox_items" (
  "id" UUID NOT NULL,
  "deduplication_key" VARCHAR(200) NOT NULL,
  "recipient_principal_id" UUID,
  "recipient_organization_id" UUID,
  "category" "NotificationCategory" NOT NULL,
  "template_key" VARCHAR(100) NOT NULL,
  "locale" VARCHAR(35) NOT NULL,
  "reference" VARCHAR(64) NOT NULL,
  "resource_type" VARCHAR(100),
  "resource_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_inbox_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_inbox_items_one_recipient_check" CHECK (
    ("recipient_principal_id" IS NOT NULL)::integer +
    ("recipient_organization_id" IS NOT NULL)::integer = 1
  ),
  CONSTRAINT "notification_inbox_items_resource_pair_check" CHECK (
    ("resource_type" IS NULL) = ("resource_id" IS NULL)
  ),
  CONSTRAINT "notification_inbox_items_principal_fkey" FOREIGN KEY ("recipient_principal_id")
    REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notification_inbox_items_organization_fkey" FOREIGN KEY ("recipient_organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_inbox_items_deduplication_key_key"
  ON "notification_inbox_items"("deduplication_key");
CREATE INDEX "notification_inbox_principal_created_idx"
  ON "notification_inbox_items"("recipient_principal_id", "created_at" DESC, "id" DESC);
CREATE INDEX "notification_inbox_org_created_idx"
  ON "notification_inbox_items"("recipient_organization_id", "created_at" DESC, "id" DESC);

CREATE TABLE "notification_inbox_reads" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "principal_id" UUID NOT NULL,
  "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_inbox_reads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_inbox_reads_item_fkey" FOREIGN KEY ("item_id")
    REFERENCES "notification_inbox_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notification_inbox_reads_principal_fkey" FOREIGN KEY ("principal_id")
    REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_inbox_reads_item_principal_key"
  ON "notification_inbox_reads"("item_id", "principal_id");
CREATE INDEX "notification_inbox_reads_principal_read_idx"
  ON "notification_inbox_reads"("principal_id", "read_at" DESC, "item_id");

CREATE TABLE "pharmacy_operational_settings" (
  "organization_id" UUID NOT NULL,
  "pickup_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "delivery_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "preparation_target_minutes" INTEGER NOT NULL DEFAULT 60,
  "updated_by_principal_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pharmacy_operational_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "pharmacy_operational_settings_fulfilment_check" CHECK (
    "pickup_enabled" OR "delivery_enabled"
  ),
  CONSTRAINT "pharmacy_operational_settings_target_check" CHECK (
    "preparation_target_minutes" BETWEEN 5 AND 10080
  ),
  CONSTRAINT "pharmacy_operational_settings_organization_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_operational_settings_updater_fkey" FOREIGN KEY ("updated_by_principal_id")
    REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION validate_pharmacy_operational_settings_organization()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = NEW.organization_id
      AND type = 'PHARMACY'
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'pharmacy operational settings require an active pharmacy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "pharmacy_operational_settings_organization_valid"
AFTER INSERT OR UPDATE OF "organization_id" ON "pharmacy_operational_settings"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION validate_pharmacy_operational_settings_organization();

COMMIT;
