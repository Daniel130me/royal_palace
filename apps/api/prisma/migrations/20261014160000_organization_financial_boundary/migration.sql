BEGIN;

CREATE TYPE "OrganizationEarningCategory" AS ENUM ('LABORATORY_SERVICE');
CREATE TYPE "OrganizationEarningStatus" AS ENUM ('AVAILABLE', 'ON_HOLD', 'RECONCILIATION_REQUIRED');
CREATE TYPE "OrganizationPayoutStatus" AS ENUM ('REQUESTED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROCESSING', 'PAID', 'FAILED');

CREATE TABLE "organization_earnings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "category" "OrganizationEarningCategory" NOT NULL,
  "gross_amount_minor" BIGINT NOT NULL,
  "payable_amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "OrganizationEarningStatus" NOT NULL DEFAULT 'AVAILABLE',
  "earned_at" TIMESTAMPTZ(6) NOT NULL,
  "hold_reason_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "organization_earnings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_earnings_positive_amounts_check" CHECK ("gross_amount_minor" > 0 AND "payable_amount_minor" >= 0 AND "payable_amount_minor" <= "gross_amount_minor"),
  CONSTRAINT "organization_earnings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "organization_payout_requests" (
  "id" UUID NOT NULL,
  "payout_number" VARCHAR(64) NOT NULL,
  "organization_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "requested_amount_minor" BIGINT NOT NULL,
  "status" "OrganizationPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "requested_by_principal_id" UUID NOT NULL,
  "reviewed_by_principal_id" UUID,
  "review_reason_code" VARCHAR(100),
  "provider_code" VARCHAR(64),
  "provider_reference" VARCHAR(255),
  "requested_at" TIMESTAMPTZ(6) NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "organization_payout_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_payout_requests_positive_amount_check" CHECK ("requested_amount_minor" > 0),
  CONSTRAINT "organization_payout_requests_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "organization_payout_requests_paid_state_check" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL))
);

CREATE TABLE "organization_payout_allocations" (
  "id" UUID NOT NULL,
  "payout_request_id" UUID NOT NULL,
  "earning_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_payout_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_payout_allocations_positive_amount_check" CHECK ("amount_minor" > 0)
);

CREATE UNIQUE INDEX "organization_earnings_payment_id_key" ON "organization_earnings"("payment_id");
CREATE INDEX "organization_earnings_org_currency_status_earned_idx" ON "organization_earnings"("organization_id", "currency", "status", "earned_at" DESC, "id" DESC);
CREATE INDEX "organization_earnings_status_earned_idx" ON "organization_earnings"("status", "earned_at", "id");
CREATE UNIQUE INDEX "organization_payout_requests_payout_number_key" ON "organization_payout_requests"("payout_number");
CREATE UNIQUE INDEX "organization_payout_requests_provider_reference_key" ON "organization_payout_requests"("provider_reference");
CREATE INDEX "organization_payouts_org_currency_status_requested_idx" ON "organization_payout_requests"("organization_id", "currency", "status", "requested_at" DESC, "id" DESC);
CREATE INDEX "organization_payouts_status_requested_idx" ON "organization_payout_requests"("status", "requested_at", "id");
CREATE UNIQUE INDEX "organization_payout_allocations_request_earning_key" ON "organization_payout_allocations"("payout_request_id", "earning_id");
CREATE INDEX "organization_payout_allocations_earning_request_idx" ON "organization_payout_allocations"("earning_id", "payout_request_id");

ALTER TABLE "organization_earnings" ADD CONSTRAINT "organization_earnings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_earnings" ADD CONSTRAINT "organization_earnings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payout_requests" ADD CONSTRAINT "organization_payout_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payout_requests" ADD CONSTRAINT "organization_payout_requests_requested_by_principal_id_fkey" FOREIGN KEY ("requested_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payout_requests" ADD CONSTRAINT "organization_payout_requests_reviewed_by_principal_id_fkey" FOREIGN KEY ("reviewed_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payout_allocations" ADD CONSTRAINT "organization_payout_allocations_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "organization_payout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payout_allocations" ADD CONSTRAINT "organization_payout_allocations_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "organization_earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_organization_payout_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_payout_id UUID;
  invalid_scope_count INTEGER;
  requested_amount BIGINT;
  allocated_amount BIGINT;
  overallocated_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'organization_payout_allocations' THEN
    target_payout_id := COALESCE(NEW."payout_request_id", OLD."payout_request_id");
  ELSE
    target_payout_id := COALESCE(NEW."id", OLD."id");
  END IF;

  SELECT p."requested_amount_minor", COALESCE(SUM(a."amount_minor"), 0)
  INTO requested_amount, allocated_amount
  FROM "organization_payout_requests" p
  LEFT JOIN "organization_payout_allocations" a ON a."payout_request_id" = p."id"
  WHERE p."id" = target_payout_id
  GROUP BY p."requested_amount_minor";

  IF requested_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF allocated_amount <> requested_amount THEN
    RAISE EXCEPTION 'Payout allocations must equal the requested amount'
      USING ERRCODE = '23514', CONSTRAINT = 'organization_payout_allocation_total_check';
  END IF;

  SELECT COUNT(*)
  INTO invalid_scope_count
  FROM "organization_payout_allocations" a
  JOIN "organization_payout_requests" p ON p."id" = a."payout_request_id"
  JOIN "organization_earnings" e ON e."id" = a."earning_id"
  WHERE a."payout_request_id" = target_payout_id
    AND (p."organization_id" <> e."organization_id" OR p."currency" <> e."currency");
  IF invalid_scope_count > 0 THEN
    RAISE EXCEPTION 'Payout allocations must match the earning organization and currency'
      USING ERRCODE = '23514', CONSTRAINT = 'organization_payout_allocation_scope_check';
  END IF;

  SELECT COUNT(*)
  INTO overallocated_count
  FROM "organization_earnings" e
  WHERE e."id" IN (
    SELECT a."earning_id"
    FROM "organization_payout_allocations" a
    WHERE a."payout_request_id" = target_payout_id
  )
    AND (
      SELECT COALESCE(SUM(a2."amount_minor"), 0)
      FROM "organization_payout_allocations" a2
      JOIN "organization_payout_requests" p2 ON p2."id" = a2."payout_request_id"
      WHERE a2."earning_id" = e."id"
        AND p2."status" NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
    ) > e."payable_amount_minor";
  IF overallocated_count > 0 THEN
    RAISE EXCEPTION 'Active payout allocations cannot exceed the earning payable amount'
      USING ERRCODE = '23514', CONSTRAINT = 'organization_payout_allocation_balance_check';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER "organization_payout_allocation_integrity_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "organization_payout_allocations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_organization_payout_integrity();

CREATE CONSTRAINT TRIGGER "organization_payout_request_integrity_trigger"
AFTER INSERT OR UPDATE ON "organization_payout_requests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_organization_payout_integrity();

COMMIT;
