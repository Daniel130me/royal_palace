BEGIN;

ALTER TABLE "laboratory_booking_reviews"
  ADD COLUMN "moderated_by_principal_id" UUID;

ALTER TABLE "laboratory_booking_reviews"
  ADD CONSTRAINT "laboratory_booking_reviews_moderator_fkey"
  FOREIGN KEY ("moderated_by_principal_id")
  REFERENCES "identity_principals"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "laboratory_booking_reviews"
  DROP CONSTRAINT "laboratory_booking_reviews_moderation_shape_check";

ALTER TABLE "laboratory_booking_reviews"
  ADD CONSTRAINT "laboratory_booking_reviews_moderation_shape_check" CHECK (
    (
      "comment_status" IN ('NOT_PROVIDED', 'PENDING') AND
      "moderated_at" IS NULL AND
      "moderated_by_principal_id" IS NULL AND
      "moderation_reason_code" IS NULL
    ) OR (
      "comment_status" = 'PUBLISHED' AND
      "moderated_at" IS NOT NULL AND
      "moderated_by_principal_id" IS NOT NULL AND
      "moderation_reason_code" IS NULL
    ) OR (
      "comment_status" = 'HIDDEN' AND
      "moderated_at" IS NOT NULL AND
      "moderated_by_principal_id" IS NOT NULL AND
      "moderation_reason_code" IN (
        'ABUSIVE_OR_HARASSING',
        'CLINICAL_DETAILS',
        'IRRELEVANT',
        'PERSONAL_DATA',
        'SPAM_OR_FRAUD'
      )
    )
  );

COMMIT;
