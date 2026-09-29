BEGIN;

DROP INDEX "facility_locations_state_city_trgm_idx";

ALTER TABLE "facility_locations"
    DROP CONSTRAINT "facility_locations_text_not_blank";

ALTER TABLE "facility_locations"
    RENAME COLUMN "city" TO "locality";

ALTER TABLE "facility_locations"
    RENAME COLUMN "state" TO "administrative_area";

ALTER TABLE "facility_locations"
    ALTER COLUMN "address_line_1" DROP NOT NULL,
    ALTER COLUMN "locality" DROP NOT NULL,
    ALTER COLUMN "administrative_area" DROP NOT NULL,
    ADD COLUMN "postal_code" VARCHAR(32),
    ADD CONSTRAINT "facility_locations_text_valid" CHECK (
        length(btrim("label")) > 0
        AND ("address_line_1" IS NULL OR length(btrim("address_line_1")) > 0)
        AND ("address_line_2" IS NULL OR length(btrim("address_line_2")) > 0)
        AND ("locality" IS NULL OR length(btrim("locality")) > 0)
        AND ("administrative_area" IS NULL OR length(btrim("administrative_area")) > 0)
        AND ("postal_code" IS NULL OR length(btrim("postal_code")) > 0)
    ),
    ADD CONSTRAINT "facility_locations_address_present" CHECK (
        "address_line_1" IS NOT NULL
        OR "locality" IS NOT NULL
        OR "administrative_area" IS NOT NULL
        OR "postal_code" IS NOT NULL
        OR "latitude" IS NOT NULL
    );

CREATE INDEX "facility_locations_region_trgm_idx"
    ON "facility_locations" USING GIN (
        "administrative_area" gin_trgm_ops,
        "locality" gin_trgm_ops
    );
CREATE INDEX "facility_locations_country_postal_idx"
    ON "facility_locations"("country_code", "postal_code", "organization_id", "id");

COMMIT;
