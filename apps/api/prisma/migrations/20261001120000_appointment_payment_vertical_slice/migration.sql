BEGIN;

CREATE TYPE "AvailabilitySlotStatus" AS ENUM ('OPEN', 'BOOKED', 'BLOCKED', 'CANCELLED');
CREATE TYPE "ConsultationFeeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'ABANDONED');
CREATE TYPE "PaymentEventType" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "LedgerOperationType" AS ENUM ('PAYMENT_SETTLEMENT', 'PAYMENT_REFUND', 'PAYMENT_REVERSAL', 'PAYMENT_DISPUTE');
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "consultation_fees" (
  "id" UUID PRIMARY KEY,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mode" "ConsultationMode" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_until" TIMESTAMPTZ(6),
  "status" "ConsultationFeeStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approved_by_principal_id" UUID REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "consultation_fees_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "consultation_fees_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "consultation_fees_validity_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
  CONSTRAINT "consultation_fees_approval_check" CHECK (("status" = 'DRAFT' AND "approved_by_principal_id" IS NULL) OR ("status" <> 'DRAFT' AND "approved_by_principal_id" IS NOT NULL)),
  CONSTRAINT "consultation_fees_version_check" CHECK ("version" > 0)
);
CREATE INDEX "consultation_fees_active_lookup_idx" ON "consultation_fees"("practitioner_id", "mode", "status", "effective_from", "id");
ALTER TABLE "consultation_fees" ADD CONSTRAINT "consultation_fees_active_period_excl"
  EXCLUDE USING gist ("practitioner_id" WITH =, "mode" WITH =, tstzrange("effective_from", COALESCE("effective_until", 'infinity'::timestamptz), '[)') WITH &&)
  WHERE ("status" = 'ACTIVE');

CREATE TABLE "availability_slots" (
  "id" UUID PRIMARY KEY,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "consultation_fee_id" UUID NOT NULL REFERENCES "consultation_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "AvailabilitySlotStatus" NOT NULL DEFAULT 'OPEN',
  "created_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "availability_slots_period_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "availability_slots_version_check" CHECK ("version" > 0)
);
CREATE INDEX "availability_slots_public_lookup_idx" ON "availability_slots"("practitioner_id", "status", "starts_at", "id");
CREATE INDEX "availability_slots_expiry_idx" ON "availability_slots"("status", "starts_at", "id");
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_practitioner_period_excl"
  EXCLUDE USING gist ("practitioner_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED');

CREATE TABLE "appointments" (
  "id" UUID PRIMARY KEY,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "practitioner_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "availability_slot_id" UUID NOT NULL UNIQUE REFERENCES "availability_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mode" "ConsultationMode" NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "payment_due_at" TIMESTAMPTZ(6) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "appointments_period_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "appointments_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "appointments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "appointments_version_check" CHECK ("version" > 0)
);
CREATE INDEX "appointments_patient_created_idx" ON "appointments"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "appointments_practitioner_starts_idx" ON "appointments"("practitioner_id", "starts_at", "id");
CREATE INDEX "appointments_payment_timeout_idx" ON "appointments"("status", "payment_due_at", "id");

CREATE TABLE "payments" (
  "id" UUID PRIMARY KEY,
  "appointment_id" UUID NOT NULL UNIQUE REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "patient_id" UUID NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reference" VARCHAR(64) NOT NULL UNIQUE,
  "provider_code" VARCHAR(64) NOT NULL,
  "provider_payment_reference" VARCHAR(255) UNIQUE,
  "amount_minor" BIGINT NOT NULL,
  "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "provider_occurred_at" TIMESTAMPTZ(6),
  "succeeded_at" TIMESTAMPTZ(6),
  "terminal_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "payments_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "payments_refund_check" CHECK ("refunded_amount_minor" >= 0 AND "refunded_amount_minor" <= "amount_minor"),
  CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payments_reference_check" CHECK (char_length("reference") BETWEEN 8 AND 64),
  CONSTRAINT "payments_version_check" CHECK ("version" > 0)
);
CREATE INDEX "payments_patient_created_idx" ON "payments"("patient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "payments_provider_reference_idx" ON "payments"("provider_code", "provider_payment_reference");
CREATE INDEX "payments_reconciliation_idx" ON "payments"("status", "updated_at", "id");

CREATE TABLE "payment_checkout_sessions" (
  "id" UUID PRIMARY KEY,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider_code" VARCHAR(64) NOT NULL,
  "provider_session_reference" VARCHAR(255) NOT NULL UNIQUE,
  "provider_payment_reference" VARCHAR(255) NOT NULL UNIQUE,
  "checkout_url" VARCHAR(2048) NOT NULL,
  "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_checkout_sessions_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE INDEX "payment_checkout_sessions_payment_status_idx" ON "payment_checkout_sessions"("payment_id", "status", "expires_at", "id");
CREATE INDEX "payment_checkout_sessions_expiry_idx" ON "payment_checkout_sessions"("status", "expires_at", "id");

CREATE TABLE "payment_webhook_events" (
  "id" UUID PRIMARY KEY,
  "inbox_event_id" UUID NOT NULL UNIQUE REFERENCES "inbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payment_id" UUID REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider_code" VARCHAR(64) NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "provider_payment_reference" VARCHAR(255) NOT NULL,
  "event_type" "PaymentEventType" NOT NULL,
  "amount_minor" BIGINT,
  "currency" CHAR(3),
  "payload_hash" CHAR(64) NOT NULL,
  "signature_key_id" VARCHAR(64) NOT NULL,
  "provider_occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "PaymentWebhookStatus" NOT NULL,
  "outcome_code" VARCHAR(100),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  CONSTRAINT "payment_webhook_provider_event_key" UNIQUE ("provider_code", "provider_event_id"),
  CONSTRAINT "payment_webhooks_amount_shape_check" CHECK (("amount_minor" IS NULL AND "currency" IS NULL) OR ("amount_minor" > 0 AND "currency" ~ '^[A-Z]{3}$')),
  CONSTRAINT "payment_webhooks_hash_check" CHECK ("payload_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "payment_webhooks_outcome_check" CHECK (
    ("status" IN ('FAILED', 'IGNORED') AND "outcome_code" IS NOT NULL)
    OR ("status" = 'PROCESSED' AND "outcome_code" IS NULL)
  )
);
CREATE INDEX "payment_webhooks_reference_occurred_idx" ON "payment_webhook_events"("provider_code", "provider_payment_reference", "provider_occurred_at", "id");
CREATE INDEX "payment_webhooks_status_received_idx" ON "payment_webhook_events"("status", "received_at", "id");

CREATE TABLE "payment_status_history" (
  "id" UUID PRIMARY KEY,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "webhook_event_id" UUID UNIQUE REFERENCES "payment_webhook_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status" "PaymentStatus",
  "to_status" "PaymentStatus" NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payment_status_history_payment_occurred_idx" ON "payment_status_history"("payment_id", "occurred_at", "id");

CREATE TABLE "ledger_transactions" (
  "id" UUID PRIMARY KEY,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event_key" VARCHAR(255) NOT NULL UNIQUE,
  "operation_type" "LedgerOperationType" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ledger_transactions_payment_occurred_idx" ON "ledger_transactions"("payment_id", "occurred_at", "id");

CREATE TABLE "ledger_entries" (
  "id" UUID PRIMARY KEY,
  "transaction_id" UUID NOT NULL REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "account_code" VARCHAR(100) NOT NULL,
  "direction" "LedgerDirection" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "ledger_entries_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ledger_entries_account_check" CHECK ("account_code" ~ '^[A-Z][A-Z0-9_]{2,99}$')
);
CREATE INDEX "ledger_entries_balance_idx" ON "ledger_entries"("transaction_id", "currency", "direction", "id");
CREATE INDEX "ledger_entries_account_report_idx" ON "ledger_entries"("account_code", "currency", "created_at", "id");

CREATE TABLE "payment_reconciliations" (
  "id" UUID PRIMARY KEY,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requested_by_principal_id" UUID NOT NULL REFERENCES "identity_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "internal_status_before" "PaymentStatus" NOT NULL,
  "provider_status" "PaymentStatus" NOT NULL,
  "applied" BOOLEAN NOT NULL,
  "result_code" VARCHAR(100) NOT NULL,
  "provider_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payment_reconciliations_payment_created_idx" ON "payment_reconciliations"("payment_id", "created_at" DESC, "id" DESC);
CREATE INDEX "payment_reconciliations_result_created_idx" ON "payment_reconciliations"("result_code", "created_at" DESC, "id" DESC);

CREATE OR REPLACE FUNCTION enforce_availability_fee_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fee_record RECORD;
BEGIN
  SELECT "practitioner_id", "status", "effective_from", "effective_until"
    INTO fee_record FROM "consultation_fees" WHERE "id" = NEW."consultation_fee_id";
  IF fee_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR fee_record."status" <> 'ACTIVE'
     OR fee_record."effective_from" > NEW."starts_at"
     OR (fee_record."effective_until" IS NOT NULL AND fee_record."effective_until" <= NEW."starts_at") THEN
    RAISE EXCEPTION 'availability requires an active fee for the same practitioner and period';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "availability_fee_scope_guard" BEFORE INSERT OR UPDATE OF "practitioner_id", "consultation_fee_id", "starts_at"
  ON "availability_slots" FOR EACH ROW EXECUTE FUNCTION enforce_availability_fee_scope();

CREATE OR REPLACE FUNCTION enforce_appointment_slot_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE slot_record RECORD;
BEGIN
  SELECT slot."practitioner_id", slot."starts_at", slot."ends_at", slot."status",
         fee."mode", fee."amount_minor", fee."currency"
    INTO slot_record
    FROM "availability_slots" AS slot
    JOIN "consultation_fees" AS fee ON fee."id" = slot."consultation_fee_id"
   WHERE slot."id" = NEW."availability_slot_id";
  IF slot_record IS NULL
     OR slot_record."status" <> 'BOOKED'
     OR slot_record."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR slot_record."starts_at" IS DISTINCT FROM NEW."starts_at"
     OR slot_record."ends_at" IS DISTINCT FROM NEW."ends_at"
     OR slot_record."mode" IS DISTINCT FROM NEW."mode"
     OR slot_record."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR slot_record."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'appointment must be an exact snapshot of its claimed availability slot';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "appointments_slot_snapshot_guard" BEFORE INSERT ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION enforce_appointment_slot_snapshot();

CREATE OR REPLACE FUNCTION prevent_appointment_commercial_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."practitioner_id" IS DISTINCT FROM NEW."practitioner_id"
     OR OLD."availability_slot_id" IS DISTINCT FROM NEW."availability_slot_id"
     OR OLD."mode" IS DISTINCT FROM NEW."mode"
     OR OLD."starts_at" IS DISTINCT FROM NEW."starts_at"
     OR OLD."ends_at" IS DISTINCT FROM NEW."ends_at"
     OR OLD."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'appointment ownership, schedule, and price snapshot are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "appointments_commercial_identity_immutable" BEFORE UPDATE ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION prevent_appointment_commercial_identity_change();

CREATE OR REPLACE FUNCTION prevent_payment_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."appointment_id" IS DISTINCT FROM NEW."appointment_id"
     OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."reference" IS DISTINCT FROM NEW."reference"
     OR OLD."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'payment identity and amount are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payments_identity_immutable" BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_identity_change();

CREATE OR REPLACE FUNCTION enforce_payment_appointment_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appointment_record RECORD;
BEGIN
  SELECT "patient_id", "amount_minor", "currency" INTO appointment_record
    FROM "appointments" WHERE "id" = NEW."appointment_id";
  IF appointment_record IS NULL
     OR appointment_record."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR appointment_record."amount_minor" IS DISTINCT FROM NEW."amount_minor"
     OR appointment_record."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'payment must be an exact commercial snapshot of its appointment';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payments_appointment_snapshot_guard" BEFORE INSERT ON "payments"
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_appointment_snapshot();

CREATE OR REPLACE FUNCTION prevent_payment_fact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment evidence and ledger facts are immutable';
END $$;
CREATE TRIGGER "payment_webhook_events_no_update" BEFORE UPDATE OR DELETE ON "payment_webhook_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_fact_mutation();
CREATE TRIGGER "payment_status_history_no_update" BEFORE UPDATE OR DELETE ON "payment_status_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_fact_mutation();
CREATE TRIGGER "ledger_transactions_no_update" BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_fact_mutation();
CREATE TRIGGER "ledger_entries_no_update" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_fact_mutation();
CREATE TRIGGER "payment_reconciliations_no_update" BEFORE UPDATE OR DELETE ON "payment_reconciliations"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_fact_mutation();

CREATE OR REPLACE FUNCTION enforce_ledger_transaction_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id UUID;
DECLARE imbalance_count INTEGER;
BEGIN
  target_id := COALESCE(NEW."transaction_id", OLD."transaction_id");
  SELECT COUNT(*) INTO imbalance_count FROM (
    SELECT "currency"
    FROM "ledger_entries"
    WHERE "transaction_id" = target_id
    GROUP BY "currency"
    HAVING SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount_minor" ELSE -"amount_minor" END) <> 0
  ) AS imbalances;
  IF imbalance_count > 0 OR (SELECT COUNT(*) FROM "ledger_entries" WHERE "transaction_id" = target_id) < 2 THEN
    RAISE EXCEPTION 'ledger transaction must contain balanced debit and credit entries';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ledger_entries_balance_guard"
  AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_ledger_transaction_balance();

COMMIT;
