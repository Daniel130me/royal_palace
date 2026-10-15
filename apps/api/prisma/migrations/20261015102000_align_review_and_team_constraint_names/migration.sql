BEGIN;

-- Keep the deployed database names aligned with Prisma's explicit relation
-- fields. These are metadata-only renames and do not rewrite table data.
ALTER TABLE "laboratory_booking_reviews"
  RENAME CONSTRAINT "laboratory_booking_reviews_booking_fkey"
  TO "laboratory_booking_reviews_booking_id_fkey";
ALTER TABLE "laboratory_booking_reviews"
  RENAME CONSTRAINT "laboratory_booking_reviews_moderator_fkey"
  TO "laboratory_booking_reviews_moderated_by_principal_id_fkey";
ALTER TABLE "laboratory_booking_reviews"
  RENAME CONSTRAINT "laboratory_booking_reviews_org_fkey"
  TO "laboratory_booking_reviews_laboratory_organization_id_fkey";
ALTER TABLE "laboratory_booking_reviews"
  RENAME CONSTRAINT "laboratory_booking_reviews_patient_fkey"
  TO "laboratory_booking_reviews_patient_id_fkey";

ALTER TABLE "organization_rating_summaries"
  RENAME CONSTRAINT "organization_rating_summaries_org_fkey"
  TO "organization_rating_summaries_organization_id_fkey";

ALTER TABLE "organization_team_invitations"
  ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "organization_team_invitations"
  RENAME CONSTRAINT "organization_team_invitations_acceptor_fkey"
  TO "organization_team_invitations_accepted_by_principal_id_fkey";
ALTER TABLE "organization_team_invitations"
  RENAME CONSTRAINT "organization_team_invitations_creator_fkey"
  TO "organization_team_invitations_created_by_principal_id_fkey";
ALTER TABLE "organization_team_invitations"
  RENAME CONSTRAINT "organization_team_invitations_membership_fkey"
  TO "organization_team_invitations_accepted_membership_id_fkey";
ALTER TABLE "organization_team_invitations"
  RENAME CONSTRAINT "organization_team_invitations_organization_fkey"
  TO "organization_team_invitations_organization_id_fkey";

COMMIT;
