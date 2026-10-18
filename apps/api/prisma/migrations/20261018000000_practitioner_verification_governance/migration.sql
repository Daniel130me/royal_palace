BEGIN;

CREATE TABLE "practitioner_verification_history" (
  "id" UUID NOT NULL,
  "practitioner_id" UUID NOT NULL,
  "actor_principal_id" UUID NOT NULL,
  "from_status" "VerificationStatus" NOT NULL,
  "to_status" "VerificationStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "note" VARCHAR(2000),
  "request_id" VARCHAR(128) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "practitioner_verification_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practitioner_verification_history_practitioner_fkey"
    FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "practitioner_verification_history_actor_fkey"
    FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "practitioner_verification_history_reason_check"
    CHECK (length(btrim("reason_code")) > 0),
  CONSTRAINT "practitioner_verification_history_note_check"
    CHECK ("note" IS NULL OR length(btrim("note")) > 0),
  CONSTRAINT "practitioner_verification_history_transition_check"
    CHECK ("from_status" <> "to_status")
);

CREATE INDEX "practitioner_verification_history_practitioner_time_idx"
  ON "practitioner_verification_history"("practitioner_id", "occurred_at", "id");
CREATE INDEX "practitioner_verification_history_actor_time_idx"
  ON "practitioner_verification_history"("actor_principal_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "practitioners_verification_updated_id_idx"
  ON "practitioners"("verification_status", "updated_at" DESC, "id" DESC);

COMMIT;
