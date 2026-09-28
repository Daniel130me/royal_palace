BEGIN;

CREATE TYPE "ExternalIdentityStatus" AS ENUM ('ACTIVE', 'UNLINKED');
CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "ExternalIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "linked_by_principal_id" UUID,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_authenticated_at" TIMESTAMPTZ(6),
    "unlinked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "external_identities_issuer_not_blank" CHECK (length(btrim("issuer")) > 0),
    CONSTRAINT "external_identities_subject_not_blank" CHECK (length(btrim("subject")) > 0),
    CONSTRAINT "external_identities_version_positive" CHECK ("version" > 0),
    CONSTRAINT "external_identities_status_dates_consistent" CHECK (
        ("status" = 'ACTIVE' AND "unlinked_at" IS NULL)
        OR ("status" = 'UNLINKED' AND "unlinked_at" IS NOT NULL)
    ),
    CONSTRAINT "external_identities_principal_id_fkey" FOREIGN KEY ("principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "external_identities_linked_by_principal_id_fkey" FOREIGN KEY ("linked_by_principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Preserve every existing issuer/subject binding before removing provider identity
-- from the application principal. Reusing the principal UUID is safe for this initial
-- one-to-one migration and avoids relying on a database UUID extension.
INSERT INTO "external_identities" (
    "id", "principal_id", "issuer", "subject", "linked_at", "last_authenticated_at"
)
SELECT "id", "id", "issuer", "subject", "created_at", "created_at"
FROM "identity_principals";

CREATE TABLE "oidc_login_transactions" (
    "id" UUID NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "nonce_ciphertext" TEXT NOT NULL,
    "pkce_verifier_ciphertext" TEXT NOT NULL,
    "encryption_key_id" VARCHAR(64) NOT NULL,
    "redirect_uri" VARCHAR(2048) NOT NULL,
    "return_to" VARCHAR(2048) NOT NULL,
    "requested_assurance" VARCHAR(255),
    "reauthenticate_session_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    CONSTRAINT "oidc_login_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oidc_login_transactions_issuer_not_blank" CHECK (length(btrim("issuer")) > 0),
    CONSTRAINT "oidc_login_transactions_state_hash_sha256" CHECK ("state_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "oidc_login_transactions_ciphertexts_not_blank" CHECK (
        length("nonce_ciphertext") > 0 AND length("pkce_verifier_ciphertext") > 0
    ),
    CONSTRAINT "oidc_login_transactions_key_id_not_blank" CHECK (length(btrim("encryption_key_id")) > 0),
    CONSTRAINT "oidc_login_transactions_expiry_valid" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "oidc_login_transactions_consumption_valid" CHECK (
        "consumed_at" IS NULL OR "consumed_at" >= "created_at"
    )
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "external_identity_id" UUID NOT NULL,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "csrf_secret_hash" CHAR(64) NOT NULL,
    "provider_refresh_token_ciphertext" TEXT,
    "provider_id_token_ciphertext" TEXT,
    "encryption_key_id" VARCHAR(64),
    "provider_session_id" VARCHAR(255),
    "authenticated_at" TIMESTAMPTZ(6) NOT NULL,
    "assurance_context" VARCHAR(255),
    "authentication_methods" VARCHAR(64)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(64)[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_csrf_secret_hash_sha256" CHECK ("csrf_secret_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "auth_sessions_encrypted_tokens_have_key" CHECK (
        ("provider_refresh_token_ciphertext" IS NULL AND "provider_id_token_ciphertext" IS NULL)
        OR "encryption_key_id" IS NOT NULL
    ),
    CONSTRAINT "auth_sessions_expiry_valid" CHECK (
        "idle_expires_at" > "created_at" AND "absolute_expires_at" >= "idle_expires_at"
    ),
    CONSTRAINT "auth_sessions_activity_valid" CHECK (
        "authenticated_at" <= "created_at" AND "last_seen_at" >= "created_at"
    ),
    CONSTRAINT "auth_sessions_revocation_consistent" CHECK (
        ("status" = 'ACTIVE' AND "revoked_at" IS NULL AND "revocation_reason" IS NULL)
        OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL)
    ),
    CONSTRAINT "auth_sessions_version_positive" CHECK ("version" > 0),
    CONSTRAINT "auth_sessions_principal_id_fkey" FOREIGN KEY ("principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "auth_sessions_external_identity_id_fkey" FOREIGN KEY ("external_identity_id")
        REFERENCES "external_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "oidc_login_transactions"
    ADD CONSTRAINT "oidc_login_transactions_reauthenticate_session_id_fkey"
    FOREIGN KEY ("reauthenticate_session_id") REFERENCES "auth_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "identity_principals_issuer_subject_key";
ALTER TABLE "identity_principals" DROP COLUMN "issuer", DROP COLUMN "subject";

CREATE UNIQUE INDEX "external_identities_issuer_subject_key"
    ON "external_identities"("issuer", "subject");
CREATE INDEX "external_identities_principal_status_id_idx"
    ON "external_identities"("principal_id", "status", "id");
CREATE UNIQUE INDEX "external_identities_one_active_per_issuer_principal_key"
    ON "external_identities"("principal_id", "issuer") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "oidc_login_transactions_state_hash_key"
    ON "oidc_login_transactions"("state_hash");
CREATE INDEX "oidc_login_transactions_expiry_id_idx"
    ON "oidc_login_transactions"("expires_at", "id");
CREATE INDEX "oidc_login_transactions_reauth_session_idx"
    ON "oidc_login_transactions"("reauthenticate_session_id");
CREATE INDEX "auth_sessions_principal_status_expiry_id_idx"
    ON "auth_sessions"("principal_id", "status", "absolute_expires_at", "id");
CREATE INDEX "auth_sessions_status_idle_expiry_id_idx"
    ON "auth_sessions"("status", "idle_expires_at", "id");

COMMIT;
