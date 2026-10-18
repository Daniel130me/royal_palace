BEGIN;

ALTER TYPE "ClinicalReferralStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TABLE "clinical_referrals"
  ADD COLUMN "recipient_practitioner_id" UUID;

ALTER TABLE "clinical_referrals"
  ADD CONSTRAINT "clinical_referrals_recipient_practitioner_id_fkey"
  FOREIGN KEY ("recipient_practitioner_id") REFERENCES "practitioners"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "clinical_referrals_sender_created_idx"
  ON "clinical_referrals"("practitioner_id", "created_at" DESC, "id" DESC);

CREATE INDEX "clinical_referrals_recipient_created_idx"
  ON "clinical_referrals"("recipient_practitioner_id", "created_at" DESC, "id" DESC);

CREATE TABLE "clinical_referral_status_history" (
  "id" UUID NOT NULL,
  "referral_id" UUID NOT NULL,
  "actor_principal_id" UUID NOT NULL,
  "from_status" "ClinicalReferralStatus" NOT NULL,
  "to_status" "ClinicalReferralStatus" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_referral_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_referral_status_history_referral_id_fkey"
    FOREIGN KEY ("referral_id") REFERENCES "clinical_referrals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_referral_status_history_actor_principal_id_fkey"
    FOREIGN KEY ("actor_principal_id") REFERENCES "identity_principals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "clinical_referral_history_referral_occurred_idx"
  ON "clinical_referral_status_history"("referral_id", "occurred_at", "id");

COMMIT;
