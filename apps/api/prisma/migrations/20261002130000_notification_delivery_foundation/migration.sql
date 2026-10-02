BEGIN;

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
    'PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTERED', 'CANCELLED'
);
CREATE TYPE "NotificationAttemptOutcome" AS ENUM (
    'STARTED', 'ACCEPTED', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN'
);

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "deduplication_key" VARCHAR(200) NOT NULL,
    "recipient_principal_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_key" VARCHAR(100) NOT NULL,
    "template_version" INTEGER NOT NULL,
    "locale" VARCHAR(35) NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "provider_code" VARCHAR(64),
    "provider_message_id" VARCHAR(255),
    "delivered_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(100),
    "replay_of_id" UUID,
    "replayed_by_principal_id" UUID,
    "replay_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_deliveries_deduplication_key_not_blank"
        CHECK (length(btrim("deduplication_key")) > 0),
    CONSTRAINT "notification_deliveries_template_key_not_blank"
        CHECK (length(btrim("template_key")) > 0),
    CONSTRAINT "notification_deliveries_template_version_positive" CHECK ("template_version" > 0),
    CONSTRAINT "notification_deliveries_locale_not_blank" CHECK (length(btrim("locale")) > 0),
    CONSTRAINT "notification_deliveries_variables_object" CHECK (jsonb_typeof("variables") = 'object'),
    CONSTRAINT "notification_deliveries_variables_bounded"
        CHECK (octet_length("variables"::text) <= 8192),
    CONSTRAINT "notification_deliveries_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "notification_deliveries_lease_state_valid" CHECK (
        ("status" = 'PROCESSING' AND "lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
        OR ("status" <> 'PROCESSING' AND "lease_token" IS NULL AND "lease_expires_at" IS NULL)
    ),
    CONSTRAINT "notification_deliveries_provider_identity_complete" CHECK (
        ("provider_code" IS NULL) = ("provider_message_id" IS NULL)
    ),
    CONSTRAINT "notification_deliveries_delivery_state_valid" CHECK (
        ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL
            AND "provider_code" IS NOT NULL AND "provider_message_id" IS NOT NULL)
        OR ("status" <> 'DELIVERED' AND "delivered_at" IS NULL)
    ),
    CONSTRAINT "notification_deliveries_replay_state_valid" CHECK (
        ("replay_of_id" IS NULL AND "replayed_by_principal_id" IS NULL AND "replay_reason" IS NULL)
        OR ("replay_of_id" IS NOT NULL AND "replayed_by_principal_id" IS NOT NULL
            AND length(btrim("replay_reason")) > 0)
    ),
    CONSTRAINT "notification_deliveries_recipient_principal_id_fkey"
        FOREIGN KEY ("recipient_principal_id") REFERENCES "identity_principals"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_deliveries_replay_of_id_fkey"
        FOREIGN KEY ("replay_of_id") REFERENCES "notification_deliveries"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_deliveries_replayed_by_principal_id_fkey"
        FOREIGN KEY ("replayed_by_principal_id") REFERENCES "identity_principals"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "notification_attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "outcome" "NotificationAttemptOutcome" NOT NULL DEFAULT 'STARTED',
    "provider_code" VARCHAR(64),
    "provider_message_id" VARCHAR(255),
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_attempts_attempt_number_positive" CHECK ("attempt_number" > 0),
    CONSTRAINT "notification_attempts_completion_state_valid" CHECK (
        ("outcome" = 'STARTED' AND "completed_at" IS NULL AND "provider_code" IS NULL
            AND "provider_message_id" IS NULL AND "error_code" IS NULL)
        OR ("outcome" <> 'STARTED' AND "completed_at" IS NOT NULL)
    ),
    CONSTRAINT "notification_attempts_provider_identity_complete" CHECK (
        ("provider_code" IS NULL) = ("provider_message_id" IS NULL)
    ),
    CONSTRAINT "notification_attempts_accepted_state_valid" CHECK (
        ("outcome" = 'ACCEPTED' AND "provider_code" IS NOT NULL AND "provider_message_id" IS NOT NULL
            AND "error_code" IS NULL)
        OR ("outcome" <> 'ACCEPTED' AND "provider_code" IS NULL AND "provider_message_id" IS NULL)
    ),
    CONSTRAINT "notification_attempts_failure_state_valid" CHECK (
        ("outcome" IN ('TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN')
            AND "error_code" IS NOT NULL)
        OR ("outcome" NOT IN ('TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN')
            AND "error_code" IS NULL)
    ),
    CONSTRAINT "notification_attempts_delivery_id_fkey"
        FOREIGN KEY ("delivery_id") REFERENCES "notification_deliveries"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_deduplication_key_key"
    ON "notification_deliveries"("deduplication_key");
CREATE UNIQUE INDEX "notification_deliveries_provider_message_key"
    ON "notification_deliveries"("provider_code", "provider_message_id");
CREATE INDEX "notification_deliveries_pending_available_idx"
    ON "notification_deliveries"("available_at", "created_at", "id")
    WHERE "status" IN ('PENDING', 'PROCESSING');
CREATE INDEX "notification_deliveries_recipient_created_idx"
    ON "notification_deliveries"("recipient_principal_id", "created_at" DESC, "id" DESC);
CREATE INDEX "notification_deliveries_replay_created_idx"
    ON "notification_deliveries"("replay_of_id", "created_at", "id");
CREATE UNIQUE INDEX "notification_attempts_delivery_number_key"
    ON "notification_attempts"("delivery_id", "attempt_number");
CREATE INDEX "notification_attempts_outcome_started_idx"
    ON "notification_attempts"("outcome", "started_at", "id");

CREATE FUNCTION protect_notification_delivery_fact() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."deduplication_key" IS DISTINCT FROM NEW."deduplication_key"
       OR OLD."recipient_principal_id" IS DISTINCT FROM NEW."recipient_principal_id"
       OR OLD."channel" IS DISTINCT FROM NEW."channel"
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

CREATE TRIGGER "notification_deliveries_protect_fact"
    BEFORE UPDATE ON "notification_deliveries"
    FOR EACH ROW EXECUTE FUNCTION protect_notification_delivery_fact();

CREATE FUNCTION protect_notification_attempt_identity() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."delivery_id" IS DISTINCT FROM NEW."delivery_id"
       OR OLD."attempt_number" IS DISTINCT FROM NEW."attempt_number"
       OR OLD."started_at" IS DISTINCT FROM NEW."started_at" THEN
        RAISE EXCEPTION 'notification attempt identity is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_attempts_protect_identity"
    BEFORE UPDATE ON "notification_attempts"
    FOR EACH ROW EXECUTE FUNCTION protect_notification_attempt_identity();

COMMIT;
