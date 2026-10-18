CREATE TABLE "appointment_intakes" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "symptoms" VARCHAR(4000),
    "consent_evidence_code" VARCHAR(100) NOT NULL,
    "consented_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "appointment_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_intakes_appointment_id_key"
    ON "appointment_intakes"("appointment_id");

CREATE INDEX "appointment_intakes_disclosure_idx"
    ON "appointment_intakes"("appointment_id", "revoked_at");

ALTER TABLE "appointment_intakes"
    ADD CONSTRAINT "appointment_intakes_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
