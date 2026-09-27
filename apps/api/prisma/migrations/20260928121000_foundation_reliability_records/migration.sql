BEGIN;

CREATE TYPE "AuditResult" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "InboxStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTERED');

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_principal_id" UUID,
    "effective_role" "PlatformRole",
    "action" VARCHAR(160) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID NOT NULL,
    "organization_id" UUID,
    "patient_scope_id" UUID,
    "result" "AuditResult" NOT NULL,
    "reason_code" VARCHAR(100),
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_action_not_blank" CHECK (length(btrim("action")) > 0),
    CONSTRAINT "audit_events_resource_type_not_blank" CHECK (length(btrim("resource_type")) > 0),
    CONSTRAINT "audit_events_request_id_not_blank" CHECK (length(btrim("request_id")) > 0),
    CONSTRAINT "audit_events_metadata_object" CHECK (jsonb_typeof("metadata") = 'object'),
    -- Keep safe audit metadata below 8 KiB; request/response bodies never belong here.
    CONSTRAINT "audit_events_metadata_bounded" CHECK (octet_length("metadata"::text) <= 8192),
    CONSTRAINT "audit_events_actor_principal_id_fkey" FOREIGN KEY ("actor_principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "operation" VARCHAR(128) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status_code" INTEGER,
    "resource_type" VARCHAR(100),
    "resource_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_keys_operation_not_blank" CHECK (length(btrim("operation")) > 0),
    CONSTRAINT "idempotency_keys_key_not_blank" CHECK (length(btrim("key")) > 0),
    CONSTRAINT "idempotency_keys_request_hash_sha256" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "idempotency_keys_response_status_valid" CHECK (
        "response_status_code" IS NULL OR "response_status_code" BETWEEN 100 AND 599
    ),
    CONSTRAINT "idempotency_keys_expiry_valid" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "idempotency_keys_principal_id_fkey" FOREIGN KEY ("principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(160) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "trace_id" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(100),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_aggregate_type_not_blank" CHECK (length(btrim("aggregate_type")) > 0),
    CONSTRAINT "outbox_events_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
    CONSTRAINT "outbox_events_event_version_positive" CHECK ("event_version" > 0),
    CONSTRAINT "outbox_events_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
    -- Large documents belong in object storage; a durable event envelope is capped at 256 KiB.
    CONSTRAINT "outbox_events_payload_bounded" CHECK (octet_length("payload"::text) <= 262144),
    CONSTRAINT "outbox_events_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "outbox_events_publication_order_valid" CHECK (
        "published_at" IS NULL OR "published_at" >= "occurred_at"
    )
);

CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "consumer" VARCHAR(128) NOT NULL,
    "message_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(160) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(100),
    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inbox_events_consumer_not_blank" CHECK (length(btrim("consumer")) > 0),
    CONSTRAINT "inbox_events_message_id_not_blank" CHECK (length(btrim("message_id")) > 0),
    CONSTRAINT "inbox_events_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
    CONSTRAINT "inbox_events_payload_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "inbox_events_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "inbox_events_processing_order_valid" CHECK (
        ("processing_at" IS NULL OR "processing_at" >= "received_at")
        AND ("processed_at" IS NULL OR "processing_at" IS NOT NULL)
        AND ("processed_at" IS NULL OR "processed_at" >= "processing_at")
    )
);

CREATE INDEX "audit_events_org_occurred_id_idx"
    ON "audit_events"("organization_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "audit_events_actor_occurred_id_idx"
    ON "audit_events"("actor_principal_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "audit_events_resource_occurred_idx"
    ON "audit_events"("resource_type", "resource_id", "occurred_at" DESC);
CREATE UNIQUE INDEX "idempotency_keys_principal_operation_key_key"
    ON "idempotency_keys"("principal_id", "operation", "key");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");
CREATE INDEX "outbox_events_aggregate_occurred_id_idx"
    ON "outbox_events"("aggregate_type", "aggregate_id", "occurred_at", "id");
CREATE INDEX "outbox_events_pending_available_idx"
    ON "outbox_events"("available_at", "occurred_at", "id")
    WHERE "published_at" IS NULL;
CREATE UNIQUE INDEX "inbox_events_consumer_message_key"
    ON "inbox_events"("consumer", "message_id");
CREATE INDEX "inbox_events_status_received_id_idx"
    ON "inbox_events"("status", "received_at", "id");

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_append_only"
    BEFORE UPDATE OR DELETE ON "audit_events"
    FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

CREATE FUNCTION protect_outbox_event_fact() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."aggregate_type" IS DISTINCT FROM NEW."aggregate_type"
       OR OLD."aggregate_id" IS DISTINCT FROM NEW."aggregate_id"
       OR OLD."event_type" IS DISTINCT FROM NEW."event_type"
       OR OLD."event_version" IS DISTINCT FROM NEW."event_version"
       OR OLD."payload" IS DISTINCT FROM NEW."payload"
       OR OLD."trace_id" IS DISTINCT FROM NEW."trace_id"
       OR OLD."occurred_at" IS DISTINCT FROM NEW."occurred_at" THEN
        RAISE EXCEPTION 'outbox event facts are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outbox_events_protect_fact"
    BEFORE UPDATE ON "outbox_events"
    FOR EACH ROW EXECUTE FUNCTION protect_outbox_event_fact();

CREATE FUNCTION protect_inbox_event_identity() RETURNS trigger AS $$
BEGIN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."consumer" IS DISTINCT FROM NEW."consumer"
       OR OLD."message_id" IS DISTINCT FROM NEW."message_id"
       OR OLD."event_type" IS DISTINCT FROM NEW."event_type"
       OR OLD."payload_hash" IS DISTINCT FROM NEW."payload_hash"
       OR OLD."received_at" IS DISTINCT FROM NEW."received_at" THEN
        RAISE EXCEPTION 'inbox event identity is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inbox_events_protect_identity"
    BEFORE UPDATE ON "inbox_events"
    FOR EACH ROW EXECUTE FUNCTION protect_inbox_event_identity();

COMMIT;
