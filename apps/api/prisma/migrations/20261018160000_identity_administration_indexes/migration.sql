BEGIN;

CREATE INDEX "identity_principals_updated_id_idx"
    ON "identity_principals" ("updated_at" DESC, "id" DESC);
CREATE INDEX "identity_principals_status_updated_id_idx"
    ON "identity_principals" ("status", "updated_at" DESC, "id" DESC);
CREATE INDEX "notification_endpoints_address_trgm_idx"
    ON "notification_recipient_endpoints" USING GIN ("normalized_address" gin_trgm_ops);

COMMIT;
