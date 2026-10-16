CREATE TYPE "OrganizationSettlementStatus" AS ENUM ('FINALIZED', 'RECONCILIATION_REQUIRED');

ALTER TABLE "organization_payout_requests"
  ADD COLUMN "executed_by_principal_id" UUID,
  ADD COLUMN "execution_started_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "organization_payouts_execution_separation_check" CHECK (
    "executed_by_principal_id" IS NULL OR (
      "reviewed_by_principal_id" IS NOT NULL AND
      "executed_by_principal_id" <> "requested_by_principal_id" AND
      "executed_by_principal_id" <> "reviewed_by_principal_id"
    )
  );

CREATE TABLE "organization_settlements" (
  "id" UUID NOT NULL,
  "settlement_number" VARCHAR(64) NOT NULL,
  "organization_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "period_start" TIMESTAMPTZ(6) NOT NULL,
  "period_end" TIMESTAMPTZ(6) NOT NULL,
  "earning_count" INTEGER NOT NULL,
  "gross_amount_minor" BIGINT NOT NULL,
  "payable_amount_minor" BIGINT NOT NULL,
  "held_amount_minor" BIGINT NOT NULL,
  "status" "OrganizationSettlementStatus" NOT NULL DEFAULT 'FINALIZED',
  "finalized_by_principal_id" UUID NOT NULL,
  "finalized_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_settlements_positive_count_check" CHECK ("earning_count" > 0),
  CONSTRAINT "organization_settlements_nonnegative_amounts_check" CHECK (
    "gross_amount_minor" >= 0 AND "payable_amount_minor" >= 0 AND "held_amount_minor" >= 0
  ),
  CONSTRAINT "organization_settlements_period_check" CHECK ("period_end" > "period_start"),
  CONSTRAINT "organization_settlements_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "organization_settlement_allocations" (
  "id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "earning_id" UUID NOT NULL,
  "gross_amount_minor_snapshot" BIGINT NOT NULL,
  "payable_amount_minor_snapshot" BIGINT NOT NULL,
  "earning_status_snapshot" "OrganizationEarningStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_settlement_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_settlement_allocations_nonnegative_amounts_check" CHECK (
    "gross_amount_minor_snapshot" >= 0 AND "payable_amount_minor_snapshot" >= 0
  )
);

CREATE UNIQUE INDEX "organization_settlements_settlement_number_key"
  ON "organization_settlements"("settlement_number");
CREATE INDEX "organization_settlements_org_currency_period_idx"
  ON "organization_settlements"("organization_id", "currency", "period_start", "period_end");
CREATE INDEX "organization_settlements_org_finalized_idx"
  ON "organization_settlements"("organization_id", "finalized_at" DESC, "id" DESC);
CREATE INDEX "organization_settlements_status_finalized_idx"
  ON "organization_settlements"("status", "finalized_at" DESC, "id" DESC);
CREATE UNIQUE INDEX "organization_settlement_allocations_earning_id_key"
  ON "organization_settlement_allocations"("earning_id");
CREATE INDEX "organization_settlement_allocations_settlement_earning_idx"
  ON "organization_settlement_allocations"("settlement_id", "earning_id");

ALTER TABLE "organization_payout_requests"
  ADD CONSTRAINT "organization_payout_requests_executed_by_principal_id_fkey"
  FOREIGN KEY ("executed_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_settlements"
  ADD CONSTRAINT "organization_settlements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_settlements"
  ADD CONSTRAINT "organization_settlements_finalized_by_principal_id_fkey"
  FOREIGN KEY ("finalized_by_principal_id") REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_settlement_allocations"
  ADD CONSTRAINT "organization_settlement_allocations_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "organization_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_settlement_allocations"
  ADD CONSTRAINT "organization_settlement_allocations_earning_id_fkey"
  FOREIGN KEY ("earning_id") REFERENCES "organization_earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
