BEGIN;

CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'TRANSACTIONAL', 'MARKETING');
CREATE TYPE "NotificationEndpointVerificationSource" AS ENUM ('OIDC_CLAIM');

ALTER TABLE "notification_deliveries"
    ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'TRANSACTIONAL';

UPDATE "notification_deliveries"
SET "category" = 'SECURITY'
WHERE "template_key" = 'SECURITY_ALERT';

CREATE TABLE "notification_recipient_endpoints" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "address" VARCHAR(320) NOT NULL,
    "normalized_address" VARCHAR(320) NOT NULL,
    "verification_source" "NotificationEndpointVerificationSource" NOT NULL,
    "source_issuer" VARCHAR(255) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "notification_recipient_endpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_endpoints_email_only"
        CHECK ("channel" = 'EMAIL'),
    CONSTRAINT "notification_endpoints_address_not_blank"
        CHECK (length(btrim("address")) > 0 AND length(btrim("normalized_address")) > 0),
    CONSTRAINT "notification_endpoints_normalized_address_canonical"
        CHECK ("normalized_address" = btrim("normalized_address")),
    CONSTRAINT "notification_endpoints_invalidation_after_verification"
        CHECK ("invalidated_at" IS NULL OR "invalidated_at" >= "verified_at"),
    CONSTRAINT "notification_endpoints_principal_id_fkey"
        FOREIGN KEY ("principal_id") REFERENCES "identity_principals"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_endpoints_one_active_email_key"
    ON "notification_recipient_endpoints"("principal_id", "channel")
    WHERE "invalidated_at" IS NULL;
CREATE INDEX "notification_endpoints_principal_channel_active_idx"
    ON "notification_recipient_endpoints"
       ("principal_id", "channel", "invalidated_at", "verified_at" DESC, "id");

CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "consented_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "consent_evidence_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_preferences_email_only" CHECK ("channel" = 'EMAIL'),
    CONSTRAINT "notification_preferences_mandatory_categories_enabled" CHECK (
        "category" = 'MARKETING' OR "enabled"
    ),
    CONSTRAINT "notification_preferences_marketing_consent" CHECK (
        ("category" = 'MARKETING' AND NOT "enabled"
            AND "consented_at" IS NULL AND "withdrawn_at" IS NULL
            AND "consent_evidence_code" IS NULL)
        OR ("category" = 'MARKETING' AND NOT "enabled"
            AND "consented_at" IS NOT NULL AND "withdrawn_at" >= "consented_at"
            AND length(btrim("consent_evidence_code")) > 0)
        OR ("category" = 'MARKETING' AND "enabled"
            AND "consented_at" IS NOT NULL AND "withdrawn_at" IS NULL
            AND length(btrim("consent_evidence_code")) > 0)
        OR ("category" <> 'MARKETING'
            AND "consented_at" IS NULL AND "withdrawn_at" IS NULL
            AND "consent_evidence_code" IS NULL)
    ),
    CONSTRAINT "notification_preferences_principal_id_fkey"
        FOREIGN KEY ("principal_id") REFERENCES "identity_principals"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_preferences_principal_channel_category_key"
    ON "notification_preferences"("principal_id", "channel", "category");

CREATE OR REPLACE FUNCTION protect_notification_delivery_fact() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."deduplication_key" IS DISTINCT FROM NEW."deduplication_key"
       OR OLD."recipient_principal_id" IS DISTINCT FROM NEW."recipient_principal_id"
       OR OLD."channel" IS DISTINCT FROM NEW."channel"
       OR OLD."category" IS DISTINCT FROM NEW."category"
       OR OLD."template_key" IS DISTINCT FROM NEW."template_key"
       OR OLD."template_version" IS DISTINCT FROM NEW."template_version"
       OR OLD."locale" IS DISTINCT FROM NEW."locale"
       OR OLD."variables" IS DISTINCT FROM NEW."variables"
       OR OLD."replay_of_id" IS DISTINCT FROM NEW."replay_of_id"
       OR OLD."replayed_by_principal_id" IS DISTINCT FROM NEW."replayed_by_principal_id"
       OR OLD."replay_reason" IS DISTINCT FROM NEW."replay_reason"
       OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
        RAISE EXCEPTION 'notification delivery facts are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_notification_endpoint_verification() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."principal_id" IS DISTINCT FROM NEW."principal_id"
       OR OLD."channel" IS DISTINCT FROM NEW."channel"
       OR OLD."address" IS DISTINCT FROM NEW."address"
       OR OLD."normalized_address" IS DISTINCT FROM NEW."normalized_address"
       OR OLD."verification_source" IS DISTINCT FROM NEW."verification_source"
       OR OLD."source_issuer" IS DISTINCT FROM NEW."source_issuer"
       OR OLD."verified_at" IS DISTINCT FROM NEW."verified_at"
       OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
        RAISE EXCEPTION 'notification endpoint verification facts are immutable';
    END IF;
    IF OLD."invalidated_at" IS NOT NULL AND NEW."invalidated_at" IS DISTINCT FROM OLD."invalidated_at" THEN
        RAISE EXCEPTION 'notification endpoint invalidation is irreversible';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_endpoints_protect_verification"
    BEFORE UPDATE ON "notification_recipient_endpoints"
    FOR EACH ROW EXECUTE FUNCTION protect_notification_endpoint_verification();

COMMIT;
