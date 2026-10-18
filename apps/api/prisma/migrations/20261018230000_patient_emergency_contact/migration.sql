CREATE TABLE "patient_emergency_contacts" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "relationship" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "patient_emergency_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patient_emergency_contacts_display_name_not_blank"
        CHECK (length(btrim("display_name")) > 0),
    CONSTRAINT "patient_emergency_contacts_phone_e164_valid"
        CHECK ("phone_e164" ~ '^\+[1-9][0-9]{1,14}$'),
    CONSTRAINT "patient_emergency_contacts_relationship_not_blank"
        CHECK (length(btrim("relationship")) > 0),
    CONSTRAINT "patient_emergency_contacts_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "patient_emergency_contacts_patient_id_key"
    ON "patient_emergency_contacts"("patient_id");

ALTER TABLE "patient_emergency_contacts"
    ADD CONSTRAINT "patient_emergency_contacts_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
