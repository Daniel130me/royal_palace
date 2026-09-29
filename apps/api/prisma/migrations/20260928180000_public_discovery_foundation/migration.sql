BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED', 'REVOKED');
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CatalogueStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "organizations"
    ADD COLUMN "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "verified_at" TIMESTAMPTZ(6),
    ADD CONSTRAINT "organizations_verification_timestamp_valid" CHECK (
        ("verification_status" = 'VERIFIED' AND "verified_at" IS NOT NULL)
        OR ("verification_status" <> 'VERIFIED')
    );

CREATE TABLE "organization_public_profiles" (
    "organization_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" VARCHAR(1000),
    "website_url" VARCHAR(2048),
    "public_phone" VARCHAR(32),
    "accepting_patients" BOOLEAN NOT NULL DEFAULT false,
    "emergency_available" BOOLEAN NOT NULL DEFAULT false,
    "open_twenty_four_hours" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "organization_public_profiles_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "organization_public_profiles_slug_format" CHECK (
        "slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    CONSTRAINT "organization_public_profiles_summary_not_blank" CHECK (
        "summary" IS NULL OR length(btrim("summary")) > 0
    ),
    CONSTRAINT "organization_public_profiles_publication_valid" CHECK (
        ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
        OR ("status" <> 'PUBLISHED')
    ),
    CONSTRAINT "organization_public_profiles_version_positive" CHECK ("version" > 0),
    CONSTRAINT "organization_public_profiles_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "facility_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" VARCHAR(120) NOT NULL,
    "address_line_1" VARCHAR(200) NOT NULL,
    "address_line_2" VARCHAR(200),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "public_phone" VARCHAR(32),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "facility_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "facility_locations_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "facility_locations_text_not_blank" CHECK (
        length(btrim("label")) > 0 AND length(btrim("address_line_1")) > 0
        AND length(btrim("city")) > 0 AND length(btrim("state")) > 0
    ),
    CONSTRAINT "facility_locations_country_code_format" CHECK ("country_code" ~ '^[A-Z]{2}$'),
    CONSTRAINT "facility_locations_coordinates_valid" CHECK (
        (("latitude" IS NULL) = ("longitude" IS NULL))
        AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
    ),
    CONSTRAINT "facility_locations_version_positive" CHECK ("version" > 0),
    CONSTRAINT "facility_locations_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "service_taxonomies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "service_taxonomies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_taxonomies_code_format" CHECK ("code" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT "service_taxonomies_text_not_blank" CHECK (
        length(btrim("name")) > 0 AND length(btrim("category")) > 0
    ),
    CONSTRAINT "service_taxonomies_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "organization_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "organization_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_services_org_service_key" UNIQUE ("organization_id", "service_id"),
    CONSTRAINT "organization_services_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "organization_services_version_positive" CHECK ("version" > 0),
    CONSTRAINT "organization_services_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "organization_services_service_id_fkey" FOREIGN KEY ("service_id")
        REFERENCES "service_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "facility_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "organization_service_id" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "facility_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "facility_services_location_service_key" UNIQUE ("location_id", "organization_service_id"),
    CONSTRAINT "facility_services_version_positive" CHECK ("version" > 0),
    CONSTRAINT "facility_services_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id")
        REFERENCES "facility_locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "facility_services_organization_id_organization_service_id_fkey" FOREIGN KEY ("organization_id", "organization_service_id")
        REFERENCES "organization_services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_public_profiles_slug_key"
    ON "organization_public_profiles"("slug");
CREATE INDEX "organization_public_profiles_status_published_idx"
    ON "organization_public_profiles"("status", "published_at" DESC, "organization_id");
CREATE INDEX "organizations_public_discovery_idx"
    ON "organizations"("type", "status", "verification_status", "display_name", "id");
CREATE INDEX "organizations_display_name_trgm_idx"
    ON "organizations" USING GIN ("display_name" gin_trgm_ops);
CREATE INDEX "organization_public_profiles_summary_trgm_idx"
    ON "organization_public_profiles" USING GIN ("summary" gin_trgm_ops);
CREATE INDEX "facility_locations_org_public_idx"
    ON "facility_locations"("organization_id", "is_public", "status", "id");
CREATE INDEX "facility_locations_state_city_trgm_idx"
    ON "facility_locations" USING GIN ("state" gin_trgm_ops, "city" gin_trgm_ops);
CREATE INDEX "facility_locations_address_trgm_idx"
    ON "facility_locations" USING GIN ("address_line_1" gin_trgm_ops);
CREATE UNIQUE INDEX "facility_locations_one_primary_per_org_key"
    ON "facility_locations"("organization_id") WHERE "is_primary" = true;
CREATE UNIQUE INDEX "service_taxonomies_code_key" ON "service_taxonomies"("code");
CREATE INDEX "service_taxonomies_status_category_name_idx"
    ON "service_taxonomies"("status", "category", "name", "id");
CREATE INDEX "service_taxonomies_name_trgm_idx"
    ON "service_taxonomies" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "organization_services_service_status_org_idx"
    ON "organization_services"("service_id", "status", "organization_id", "id");
CREATE INDEX "organization_services_org_status_service_idx"
    ON "organization_services"("organization_id", "status", "service_id", "id");
CREATE INDEX "facility_services_offering_status_location_idx"
    ON "facility_services"("organization_service_id", "status", "location_id", "id");

COMMIT;
