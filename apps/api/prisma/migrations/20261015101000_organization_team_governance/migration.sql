BEGIN;

CREATE TYPE "OrganizationTeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- Active membership and active membership-role uniqueness is a cross-cutting
-- identity invariant. Fail visibly if historical data violates it rather than
-- silently selecting one row and hiding a production-data problem.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "memberships"
    WHERE "effective_until" IS NULL
    GROUP BY "organization_id", "principal_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce active membership uniqueness: duplicate active memberships exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "role_assignments"
    WHERE "membership_id" IS NOT NULL AND "effective_until" IS NULL
    GROUP BY "membership_id", "role"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce active membership-role uniqueness: duplicate active roles exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "memberships_one_active_org_principal_key"
  ON "memberships"("organization_id", "principal_id")
  WHERE "effective_until" IS NULL;

CREATE UNIQUE INDEX "role_assignments_one_active_membership_role_key"
  ON "role_assignments"("membership_id", "role")
  WHERE "membership_id" IS NOT NULL AND "effective_until" IS NULL;

CREATE TABLE "organization_team_invitations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "token_digest" CHAR(64) NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "status" "OrganizationTeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "created_by_principal_id" UUID NOT NULL,
  "accepted_by_principal_id" UUID,
  "accepted_membership_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "organization_team_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_team_invitations_token_digest_key" UNIQUE ("token_digest"),
  CONSTRAINT "organization_team_invitations_accepted_membership_key" UNIQUE ("accepted_membership_id"),
  CONSTRAINT "organization_team_invitations_role_check" CHECK ("role" = 'ORGANIZATION_STAFF'),
  CONSTRAINT "organization_team_invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "organization_team_invitations_state_check" CHECK (
    ("status" = 'PENDING' AND "accepted_by_principal_id" IS NULL AND "accepted_membership_id" IS NULL AND "accepted_at" IS NULL AND "revoked_at" IS NULL)
    OR ("status" = 'ACCEPTED' AND "accepted_by_principal_id" IS NOT NULL AND "accepted_membership_id" IS NOT NULL AND "accepted_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "accepted_by_principal_id" IS NULL AND "accepted_membership_id" IS NULL AND "accepted_at" IS NULL AND "revoked_at" IS NOT NULL)
  ),
  CONSTRAINT "organization_team_invitations_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_team_invitations_creator_fkey"
    FOREIGN KEY ("created_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_team_invitations_acceptor_fkey"
    FOREIGN KEY ("accepted_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_team_invitations_membership_fkey"
    FOREIGN KEY ("accepted_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "organization_team_invitations_org_status_created_idx"
  ON "organization_team_invitations"("organization_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "organization_team_invitations_status_expiry_idx"
  ON "organization_team_invitations"("status", "expires_at", "id");

-- Only the exact applicant attached to an approved organization receives the
-- initial administrative role. There is no oldest-member or first-row guess.
INSERT INTO "role_assignments" (
  "id", "membership_id", "granted_by_principal_id", "role", "scope",
  "effective_from", "created_at", "updated_at", "version"
)
SELECT
  gen_random_uuid(), membership."id", application."decided_by_principal_id",
  'ORGANIZATION_ADMIN', 'ORGANIZATION', COALESCE(application."decided_at", membership."effective_from"),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
FROM "onboarding_applications" application
JOIN "memberships" membership
  ON membership."organization_id" = application."approved_organization_id"
 AND membership."principal_id" = application."applicant_principal_id"
 AND membership."effective_until" IS NULL
WHERE application."approved_organization_id" IS NOT NULL
  AND application."status" = 'APPROVED'
  AND NOT EXISTS (
    SELECT 1
    FROM "role_assignments" existing
    WHERE existing."membership_id" = membership."id"
      AND existing."role" = 'ORGANIZATION_ADMIN'
      AND existing."effective_until" IS NULL
  );

CREATE FUNCTION enforce_organization_team_invitation_update()
RETURNS trigger AS $$
DECLARE
  accepted_membership "memberships"%ROWTYPE;
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
    OR NEW."token_digest" IS DISTINCT FROM OLD."token_digest"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."created_by_principal_id" IS DISTINCT FROM OLD."created_by_principal_id"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Organization team invitation identity is immutable';
  END IF;

  IF OLD."status" <> 'PENDING' OR NEW."status" NOT IN ('ACCEPTED', 'REVOKED') THEN
    RAISE EXCEPTION 'Organization team invitation transition is invalid';
  END IF;

  IF NEW."status" = 'ACCEPTED' THEN
    SELECT * INTO accepted_membership
    FROM "memberships"
    WHERE "id" = NEW."accepted_membership_id";

    IF accepted_membership."organization_id" IS DISTINCT FROM NEW."organization_id"
      OR accepted_membership."principal_id" IS DISTINCT FROM NEW."accepted_by_principal_id"
      OR accepted_membership."effective_until" IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM "role_assignments" role_assignment
        WHERE role_assignment."membership_id" = accepted_membership."id"
          AND role_assignment."role" = NEW."role"
          AND role_assignment."effective_until" IS NULL
      ) THEN
      RAISE EXCEPTION 'Accepted invitation membership or role is invalid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "organization_team_invitations_update_guard"
  BEFORE UPDATE ON "organization_team_invitations"
  FOR EACH ROW EXECUTE FUNCTION enforce_organization_team_invitation_update();

COMMIT;
