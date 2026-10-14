BEGIN;

CREATE TYPE "ReviewCommentStatus" AS ENUM (
  'NOT_PROVIDED',
  'PENDING',
  'PUBLISHED',
  'HIDDEN'
);

CREATE TABLE "laboratory_booking_reviews" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "laboratory_organization_id" UUID NOT NULL,
  "score" SMALLINT NOT NULL,
  "comment" VARCHAR(2000),
  "comment_status" "ReviewCommentStatus" NOT NULL DEFAULT 'NOT_PROVIDED',
  "moderation_reason_code" VARCHAR(100),
  "submitted_at" TIMESTAMPTZ(6) NOT NULL,
  "moderated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "laboratory_booking_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "laboratory_booking_reviews_score_check" CHECK ("score" BETWEEN 1 AND 5),
  CONSTRAINT "laboratory_booking_reviews_comment_shape_check" CHECK (
    ("comment" IS NULL AND "comment_status" = 'NOT_PROVIDED') OR
    ("comment" IS NOT NULL AND "comment_status" <> 'NOT_PROVIDED')
  ),
  CONSTRAINT "laboratory_booking_reviews_moderation_shape_check" CHECK (
    ("comment_status" IN ('NOT_PROVIDED', 'PENDING') AND "moderated_at" IS NULL AND "moderation_reason_code" IS NULL) OR
    ("comment_status" = 'PUBLISHED' AND "moderated_at" IS NOT NULL) OR
    ("comment_status" = 'HIDDEN' AND "moderated_at" IS NOT NULL AND "moderation_reason_code" IS NOT NULL)
  ),
  CONSTRAINT "laboratory_booking_reviews_booking_key" UNIQUE ("booking_id"),
  CONSTRAINT "laboratory_booking_reviews_booking_fkey" FOREIGN KEY ("booking_id") REFERENCES "laboratory_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "laboratory_booking_reviews_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "laboratory_booking_reviews_org_fkey" FOREIGN KEY ("laboratory_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "laboratory_booking_reviews_patient_submitted_idx"
  ON "laboratory_booking_reviews"("patient_id", "submitted_at" DESC, "id" DESC);
CREATE INDEX "laboratory_booking_reviews_org_submitted_idx"
  ON "laboratory_booking_reviews"("laboratory_organization_id", "submitted_at" DESC, "id" DESC);
CREATE INDEX "laboratory_booking_reviews_moderation_queue_idx"
  ON "laboratory_booking_reviews"("comment_status", "submitted_at", "id");

CREATE TABLE "organization_rating_summaries" (
  "organization_id" UUID NOT NULL,
  "rating_count" INTEGER NOT NULL DEFAULT 0,
  "rating_sum" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "organization_rating_summaries_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "organization_rating_summaries_values_check" CHECK (
    "rating_count" >= 0 AND
    "rating_sum" >= "rating_count" AND
    "rating_sum" <= ("rating_count" * 5) AND
    (("rating_count" = 0 AND "rating_sum" = 0) OR "rating_count" > 0)
  ),
  CONSTRAINT "organization_rating_summaries_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION "validate_laboratory_booking_review"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_patient_id UUID;
  booking_organization_id UUID;
  booking_status "LaboratoryBookingStatus";
  organization_type "OrganizationType";
BEGIN
  SELECT
    request."patient_id",
    booking."laboratory_organization_id",
    booking."status",
    organization."type"
  INTO
    booking_patient_id,
    booking_organization_id,
    booking_status,
    organization_type
  FROM "laboratory_bookings" booking
  JOIN "laboratory_requests" request ON request."id" = booking."request_id"
  JOIN "organizations" organization ON organization."id" = booking."laboratory_organization_id"
  WHERE booking."id" = NEW."booking_id";

  IF booking_patient_id IS NULL THEN
    RAISE EXCEPTION 'laboratory review booking does not exist';
  END IF;
  IF booking_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'laboratory review requires a completed booking';
  END IF;
  IF organization_type <> 'LABORATORY' THEN
    RAISE EXCEPTION 'laboratory review organization must be a laboratory';
  END IF;
  IF NEW."patient_id" <> booking_patient_id OR NEW."laboratory_organization_id" <> booking_organization_id THEN
    RAISE EXCEPTION 'laboratory review scope does not match its booking';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_laboratory_booking_review"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."booking_id" IS DISTINCT FROM NEW."booking_id"
    OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
    OR OLD."laboratory_organization_id" IS DISTINCT FROM NEW."laboratory_organization_id"
    OR OLD."score" IS DISTINCT FROM NEW."score"
    OR OLD."comment" IS DISTINCT FROM NEW."comment"
    OR OLD."submitted_at" IS DISTINCT FROM NEW."submitted_at"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'verified review evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "update_organization_rating_summary"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "organization_rating_summaries" (
    "organization_id",
    "rating_count",
    "rating_sum",
    "updated_at",
    "version"
  ) VALUES (
    NEW."laboratory_organization_id",
    1,
    NEW."score",
    NEW."submitted_at",
    1
  )
  ON CONFLICT ("organization_id") DO UPDATE SET
    "rating_count" = "organization_rating_summaries"."rating_count" + 1,
    "rating_sum" = "organization_rating_summaries"."rating_sum" + EXCLUDED."rating_sum",
    "updated_at" = EXCLUDED."updated_at",
    "version" = "organization_rating_summaries"."version" + 1;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "prevent_laboratory_booking_review_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'verified review evidence cannot be deleted';
END;
$$;

CREATE TRIGGER "laboratory_booking_reviews_validate_insert"
BEFORE INSERT ON "laboratory_booking_reviews"
FOR EACH ROW EXECUTE FUNCTION "validate_laboratory_booking_review"();

CREATE TRIGGER "laboratory_booking_reviews_protect_update"
BEFORE UPDATE ON "laboratory_booking_reviews"
FOR EACH ROW EXECUTE FUNCTION "protect_laboratory_booking_review"();

CREATE TRIGGER "laboratory_booking_reviews_update_summary"
AFTER INSERT ON "laboratory_booking_reviews"
FOR EACH ROW EXECUTE FUNCTION "update_organization_rating_summary"();

CREATE TRIGGER "laboratory_booking_reviews_prevent_delete"
BEFORE DELETE ON "laboratory_booking_reviews"
FOR EACH ROW EXECUTE FUNCTION "prevent_laboratory_booking_review_delete"();

COMMIT;
