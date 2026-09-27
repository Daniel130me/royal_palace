BEGIN;

CREATE TYPE "PrincipalStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "OrganizationType" AS ENUM ('HOSPITAL', 'PHARMACY', 'LABORATORY');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'ORGANIZATION');
CREATE TYPE "PlatformRole" AS ENUM (
    'PATIENT',
    'MANAGER',
    'ORGANIZATION_APPLICANT',
    'ORGANIZATION_STAFF',
    'PROVIDER',
    'SUPPORT',
    'ADMINISTRATOR',
    'FINANCE',
    'LOGISTICS',
    'SYSTEM_WORKER'
);

CREATE TABLE "identity_principals" (
    "id" UUID NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "PrincipalStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "identity_principals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "identity_principals_issuer_not_blank" CHECK (length(btrim("issuer")) > 0),
    CONSTRAINT "identity_principals_subject_not_blank" CHECK (length(btrim("subject")) > 0),
    CONSTRAINT "identity_principals_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "legal_name" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizations_legal_name_not_blank" CHECK (length(btrim("legal_name")) > 0),
    CONSTRAINT "organizations_display_name_not_blank" CHECK (length(btrim("display_name")) > 0),
    CONSTRAINT "organizations_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memberships_effective_range_valid" CHECK (
        "effective_until" IS NULL OR "effective_until" > "effective_from"
    ),
    CONSTRAINT "memberships_version_positive" CHECK ("version" > 0),
    CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "memberships_principal_id_fkey" FOREIGN KEY ("principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "principal_id" UUID,
    "membership_id" UUID,
    "granted_by_principal_id" UUID,
    "role" "PlatformRole" NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_assignments_subject_matches_scope" CHECK (
        ("scope" = 'PLATFORM' AND "principal_id" IS NOT NULL AND "membership_id" IS NULL)
        OR
        ("scope" = 'ORGANIZATION' AND "principal_id" IS NULL AND "membership_id" IS NOT NULL)
    ),
    CONSTRAINT "role_assignments_effective_range_valid" CHECK (
        "effective_until" IS NULL OR "effective_until" > "effective_from"
    ),
    CONSTRAINT "role_assignments_version_positive" CHECK ("version" > 0),
    CONSTRAINT "role_assignments_principal_id_fkey" FOREIGN KEY ("principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "role_assignments_membership_id_fkey" FOREIGN KEY ("membership_id")
        REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "role_assignments_granted_by_principal_id_fkey" FOREIGN KEY ("granted_by_principal_id")
        REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "identity_principals_issuer_subject_key"
    ON "identity_principals"("issuer", "subject");
CREATE INDEX "identity_principals_status_created_id_idx"
    ON "identity_principals"("status", "created_at", "id");
CREATE INDEX "organizations_type_status_name_id_idx"
    ON "organizations"("type", "status", "display_name", "id");
CREATE INDEX "memberships_org_effective_id_idx"
    ON "memberships"("organization_id", "effective_from", "id");
CREATE INDEX "memberships_principal_effective_id_idx"
    ON "memberships"("principal_id", "effective_from", "id");
CREATE UNIQUE INDEX "memberships_one_current_principal_per_org_key"
    ON "memberships"("organization_id", "principal_id")
    WHERE "effective_until" IS NULL;
CREATE INDEX "role_assignments_principal_scope_effective_id_idx"
    ON "role_assignments"("principal_id", "scope", "effective_from", "id");
CREATE INDEX "role_assignments_membership_role_effective_id_idx"
    ON "role_assignments"("membership_id", "role", "effective_from", "id");
CREATE UNIQUE INDEX "role_assignments_one_current_platform_role_key"
    ON "role_assignments"("principal_id", "role")
    WHERE "scope" = 'PLATFORM' AND "effective_until" IS NULL;
CREATE UNIQUE INDEX "role_assignments_one_current_org_role_key"
    ON "role_assignments"("membership_id", "role")
    WHERE "scope" = 'ORGANIZATION' AND "effective_until" IS NULL;

COMMIT;
