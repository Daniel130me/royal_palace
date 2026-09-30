BEGIN;

CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'AUDIO', 'CHAT', 'IN_PERSON', 'HOME_VISIT');

CREATE TABLE "profession_taxonomies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "source_system" VARCHAR(255) NOT NULL,
    "source_version" VARCHAR(80),
    "source_code" VARCHAR(120),
    "source_uri" VARCHAR(2048),
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "profession_taxonomies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profession_taxonomies_text_valid" CHECK (
        length(btrim("code")) > 0
        AND length(btrim("name")) > 0
        AND length(btrim("source_system")) > 0
    ),
    CONSTRAINT "profession_taxonomies_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "specialty_taxonomies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "parent_id" UUID,
    "source_system" VARCHAR(255) NOT NULL,
    "source_version" VARCHAR(80),
    "source_code" VARCHAR(120),
    "source_uri" VARCHAR(2048),
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "specialty_taxonomies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "specialty_taxonomies_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    CONSTRAINT "specialty_taxonomies_text_valid" CHECK (
        length(btrim("code")) > 0
        AND length(btrim("name")) > 0
        AND length(btrim("category")) > 0
        AND length(btrim("source_system")) > 0
    ),
    CONSTRAINT "specialty_taxonomies_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "practitioners" (
    "id" UUID NOT NULL,
    "principal_id" UUID,
    "display_name" VARCHAR(160) NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100) NOT NULL,
    "honorific" VARCHAR(40),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "practitioners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioners_name_valid" CHECK (
        length(btrim("display_name")) > 0
        AND length(btrim("given_name")) > 0
        AND length(btrim("family_name")) > 0
    ),
    CONSTRAINT "practitioners_verification_timestamp_valid" CHECK (
        ("verification_status" = 'PENDING' AND "verified_at" IS NULL)
        OR ("verification_status" <> 'PENDING' AND "verified_at" IS NOT NULL)
    ),
    CONSTRAINT "practitioners_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "practitioner_public_profiles" (
    "practitioner_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "headline" VARCHAR(240),
    "biography" VARCHAR(3000),
    "photo_url" VARCHAR(2048),
    "years_experience" INTEGER,
    "accepting_patients" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "practitioner_public_profiles_pkey" PRIMARY KEY ("practitioner_id"),
    CONSTRAINT "practitioner_public_profiles_text_valid" CHECK (
        length(btrim("slug")) > 0
        AND ("headline" IS NULL OR length(btrim("headline")) > 0)
        AND ("biography" IS NULL OR length(btrim("biography")) > 0)
    ),
    CONSTRAINT "practitioner_public_profiles_publication_valid" CHECK (
        ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
        OR ("status" <> 'PUBLISHED')
    ),
    CONSTRAINT "practitioner_public_profiles_experience_valid" CHECK (
        "years_experience" IS NULL OR "years_experience" BETWEEN 0 AND 100
    ),
    CONSTRAINT "practitioner_public_profiles_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "practitioner_professions" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "profession_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practitioner_professions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practitioner_specialties" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practitioner_specialties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practitioner_locations" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" VARCHAR(120) NOT NULL,
    "address_line_1" VARCHAR(200),
    "address_line_2" VARCHAR(200),
    "locality" VARCHAR(100),
    "administrative_area" VARCHAR(100),
    "postal_code" VARCHAR(32),
    "country_code" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "practitioner_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_locations_country_valid" CHECK ("country_code" ~ '^[A-Z]{2}$'),
    CONSTRAINT "practitioner_locations_coordinates_valid" CHECK (
        (("latitude" IS NULL) = ("longitude" IS NULL))
        AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
        AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
    ),
    CONSTRAINT "practitioner_locations_address_present" CHECK (
        "address_line_1" IS NOT NULL OR "locality" IS NOT NULL
        OR "administrative_area" IS NOT NULL OR "postal_code" IS NOT NULL
        OR "latitude" IS NOT NULL
    ),
    CONSTRAINT "practitioner_locations_text_valid" CHECK (
        length(btrim("label")) > 0
        AND ("address_line_1" IS NULL OR length(btrim("address_line_1")) > 0)
        AND ("address_line_2" IS NULL OR length(btrim("address_line_2")) > 0)
        AND ("locality" IS NULL OR length(btrim("locality")) > 0)
        AND ("administrative_area" IS NULL OR length(btrim("administrative_area")) > 0)
        AND ("postal_code" IS NULL OR length(btrim("postal_code")) > 0)
    ),
    CONSTRAINT "practitioner_locations_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "practitioner_service_modes" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "mode" "ConsultationMode" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practitioner_service_modes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practitioner_languages" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "language_tag" VARCHAR(35) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practitioner_languages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_languages_tag_valid" CHECK (
        "language_tag" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
    )
);

CREATE TABLE "practitioner_affiliations" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "organization_id" UUID,
    "facility_name" VARCHAR(200) NOT NULL,
    "role_title" VARCHAR(160),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" DATE,
    "ends_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "practitioner_affiliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_affiliations_text_valid" CHECK (
        length(btrim("facility_name")) > 0
        AND ("role_title" IS NULL OR length(btrim("role_title")) > 0)
    ),
    CONSTRAINT "practitioner_affiliations_dates_valid" CHECK (
        "ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at"
    ),
    CONSTRAINT "practitioner_affiliations_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "practitioner_public_credentials" (
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "issuer_name" VARCHAR(200) NOT NULL,
    "jurisdiction_code" VARCHAR(16),
    "awarded_year" INTEGER,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "practitioner_public_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_public_credentials_text_valid" CHECK (
        length(btrim("title")) > 0 AND length(btrim("issuer_name")) > 0
    ),
    CONSTRAINT "practitioner_public_credentials_year_valid" CHECK (
        "awarded_year" IS NULL OR "awarded_year" BETWEEN 1800 AND 2200
    ),
    CONSTRAINT "practitioner_public_credentials_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "profession_taxonomies_code_key" ON "profession_taxonomies"("code");
CREATE INDEX "profession_taxonomies_status_name_idx" ON "profession_taxonomies"("status", "name", "id");
CREATE INDEX "profession_taxonomies_name_trgm_idx" ON "profession_taxonomies" USING GIN ("name" gin_trgm_ops);
CREATE UNIQUE INDEX "specialty_taxonomies_code_key" ON "specialty_taxonomies"("code");
CREATE INDEX "specialty_taxonomies_status_category_name_idx" ON "specialty_taxonomies"("status", "category", "name", "id");
CREATE INDEX "specialty_taxonomies_name_trgm_idx" ON "specialty_taxonomies" USING GIN ("name" gin_trgm_ops);
CREATE UNIQUE INDEX "practitioners_principal_id_key" ON "practitioners"("principal_id");
CREATE INDEX "practitioners_public_discovery_idx" ON "practitioners"("verification_status", "display_name", "id");
CREATE INDEX "practitioners_display_name_trgm_idx" ON "practitioners" USING GIN ("display_name" gin_trgm_ops);
CREATE UNIQUE INDEX "practitioner_public_profiles_slug_key" ON "practitioner_public_profiles"("slug");
CREATE INDEX "practitioner_public_profiles_status_published_idx" ON "practitioner_public_profiles"("status", "published_at" DESC, "practitioner_id");
CREATE INDEX "practitioner_public_profiles_headline_trgm_idx" ON "practitioner_public_profiles" USING GIN ("headline" gin_trgm_ops);
CREATE UNIQUE INDEX "practitioner_professions_practitioner_profession_key" ON "practitioner_professions"("practitioner_id", "profession_id");
CREATE UNIQUE INDEX "practitioner_professions_one_primary_idx" ON "practitioner_professions"("practitioner_id") WHERE "is_primary";
CREATE INDEX "practitioner_professions_profession_practitioner_idx" ON "practitioner_professions"("profession_id", "practitioner_id", "id");
CREATE UNIQUE INDEX "practitioner_specialties_practitioner_specialty_key" ON "practitioner_specialties"("practitioner_id", "specialty_id");
CREATE UNIQUE INDEX "practitioner_specialties_one_primary_idx" ON "practitioner_specialties"("practitioner_id") WHERE "is_primary";
CREATE INDEX "practitioner_specialties_specialty_practitioner_idx" ON "practitioner_specialties"("specialty_id", "practitioner_id", "id");
CREATE UNIQUE INDEX "practitioner_locations_one_primary_idx" ON "practitioner_locations"("practitioner_id") WHERE "is_primary";
CREATE INDEX "practitioner_locations_practitioner_public_idx" ON "practitioner_locations"("practitioner_id", "is_public", "status", "id");
CREATE INDEX "practitioner_locations_country_postal_idx" ON "practitioner_locations"("country_code", "postal_code", "practitioner_id", "id");
CREATE INDEX "practitioner_locations_region_trgm_idx" ON "practitioner_locations" USING GIN ("administrative_area" gin_trgm_ops, "locality" gin_trgm_ops);
CREATE UNIQUE INDEX "practitioner_service_modes_practitioner_mode_key" ON "practitioner_service_modes"("practitioner_id", "mode");
CREATE INDEX "practitioner_service_modes_mode_practitioner_idx" ON "practitioner_service_modes"("mode", "practitioner_id", "id");
CREATE UNIQUE INDEX "practitioner_languages_practitioner_language_key" ON "practitioner_languages"("practitioner_id", "language_tag");
CREATE INDEX "practitioner_languages_language_practitioner_idx" ON "practitioner_languages"("language_tag", "practitioner_id", "id");
CREATE INDEX "practitioner_affiliations_practitioner_public_idx" ON "practitioner_affiliations"("practitioner_id", "is_public", "id");
CREATE INDEX "practitioner_affiliations_organization_idx" ON "practitioner_affiliations"("organization_id", "practitioner_id", "id");
CREATE INDEX "practitioner_credentials_public_idx" ON "practitioner_public_credentials"("practitioner_id", "is_public", "verified_at", "id");

ALTER TABLE "specialty_taxonomies" ADD CONSTRAINT "specialty_taxonomies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "specialty_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_public_profiles" ADD CONSTRAINT "practitioner_public_profiles_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_professions" ADD CONSTRAINT "practitioner_professions_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_professions" ADD CONSTRAINT "practitioner_professions_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "profession_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialty_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_locations" ADD CONSTRAINT "practitioner_locations_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_service_modes" ADD CONSTRAINT "practitioner_service_modes_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_languages" ADD CONSTRAINT "practitioner_languages_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_affiliations" ADD CONSTRAINT "practitioner_affiliations_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_affiliations" ADD CONSTRAINT "practitioner_affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_public_credentials" ADD CONSTRAINT "practitioner_public_credentials_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
