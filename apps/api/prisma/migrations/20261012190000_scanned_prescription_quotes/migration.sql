BEGIN;

ALTER TABLE "pharmacy_quotes"
  ADD COLUMN "scanned_prescription_id" UUID,
  ADD CONSTRAINT "pharmacy_quotes_scanned_prescription_fkey"
    FOREIGN KEY ("scanned_prescription_id") REFERENCES "scanned_prescriptions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  DROP CONSTRAINT "pharmacy_quotes_source_check",
  ADD CONSTRAINT "pharmacy_quotes_source_check" CHECK (
    ("kind" = 'PRESCRIPTION' AND "prescription_id" IS NOT NULL
      AND "prescription_route_id" IS NOT NULL AND "fill_number" IS NOT NULL
      AND "scanned_prescription_id" IS NULL)
    OR
    ("kind" = 'DIRECT_OTC' AND "prescription_id" IS NULL
      AND "prescription_route_id" IS NULL AND "fill_number" IS NULL
      AND "scanned_prescription_id" IS NULL)
    OR
    ("kind" = 'SCANNED_PRESCRIPTION' AND "prescription_id" IS NULL
      AND "prescription_route_id" IS NULL AND "fill_number" IS NULL
      AND "scanned_prescription_id" IS NOT NULL)
  );

CREATE INDEX "pharmacy_quotes_scanned_created_idx"
  ON "pharmacy_quotes"("scanned_prescription_id", "created_at" DESC, "id" DESC);

CREATE INDEX "scanned_prescriptions_pharmacy_created_idx"
  ON "scanned_prescriptions"("pharmacy_organization_id", "created_at" DESC, "id" DESC);

CREATE UNIQUE INDEX "pharmacy_quotes_one_active_scanned_idx"
  ON "pharmacy_quotes"("scanned_prescription_id")
  WHERE "kind" = 'SCANNED_PRESCRIPTION' AND "status" IN ('ACTIVE', 'ACCEPTED');

-- Review actions set these transaction-local values so the existing append-only
-- history records both the responsible principal and patient-visible context.
CREATE OR REPLACE FUNCTION record_scanned_prescription_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO scanned_prescription_status_history (
      id, scanned_prescription_id, from_status, to_status, actor_principal_id,
      reason_code, patient_visible_note, occurred_at
    ) VALUES (
      gen_random_uuid(), NEW.id, OLD.status, NEW.status,
      NULLIF(current_setting('app.actor_principal_id', true), '')::uuid,
      COALESCE(NEW.status_reason_code, 'STATUS_TRANSITION'),
      NULLIF(current_setting('app.patient_visible_note', true), ''), clock_timestamp()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_pharmacy_quote_snapshot_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."quote_number" IS DISTINCT FROM NEW."quote_number"
     OR OLD."kind" IS DISTINCT FROM NEW."kind"
     OR OLD."prescription_id" IS DISTINCT FROM NEW."prescription_id"
     OR OLD."prescription_route_id" IS DISTINCT FROM NEW."prescription_route_id"
     OR OLD."scanned_prescription_id" IS DISTINCT FROM NEW."scanned_prescription_id"
     OR OLD."pharmacy_organization_id" IS DISTINCT FROM NEW."pharmacy_organization_id"
     OR OLD."patient_id" IS DISTINCT FROM NEW."patient_id"
     OR OLD."fill_number" IS DISTINCT FROM NEW."fill_number"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."subtotal_minor" IS DISTINCT FROM NEW."subtotal_minor"
     OR OLD."tax_minor" IS DISTINCT FROM NEW."tax_minor"
     OR OLD."fee_minor" IS DISTINCT FROM NEW."fee_minor"
     OR OLD."total_minor" IS DISTINCT FROM NEW."total_minor"
     OR OLD."expires_at" IS DISTINCT FROM NEW."expires_at"
     OR OLD."created_by_principal_id" IS DISTINCT FROM NEW."created_by_principal_id" THEN
    RAISE EXCEPTION 'pharmacy quote commercial snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_pharmacy_quote_line_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote_kind "PharmacyQuoteKind";
BEGIN
  SELECT "kind" INTO quote_kind FROM "pharmacy_quotes" WHERE "id" = NEW."quote_id";
  IF quote_kind = 'PRESCRIPTION' AND NEW."prescription_item_id" IS NULL THEN
    RAISE EXCEPTION 'prescription quote line requires a prescription item';
  END IF;
  IF quote_kind IN ('DIRECT_OTC', 'SCANNED_PRESCRIPTION') AND
     (NEW."prescription_item_id" IS NOT NULL OR NEW."substitution_proposal_id" IS NOT NULL
       OR NEW."catalog_item_id" IS NULL) THEN
    RAISE EXCEPTION 'catalogue quote line must reference only a catalogue item';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_pharmacy_handoff_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_record RECORD;
BEGIN
  IF NEW."status" <> 'HANDED_OFF' OR OLD."status" = 'HANDED_OFF' THEN RETURN NEW; END IF;
  SELECT orders."prescription_route_id", quotes."fill_number", orders."quote_id", quotes."kind"
    INTO order_record
    FROM "pharmacy_orders" orders
    JOIN "pharmacy_quotes" quotes ON quotes."id" = orders."quote_id"
   WHERE orders."id" = NEW."order_id" AND orders."status" = 'CONFIRMED';
  IF order_record IS NULL THEN
    RAISE EXCEPTION 'handoff requires a confirmed order';
  END IF;
  IF order_record."kind" <> 'PRESCRIPTION' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "inventory_reservations"
       WHERE "quote_id" = order_record."quote_id" AND "status" = 'CONSUMED'
    ) THEN
      RAISE EXCEPTION 'catalogue order handoff requires consumed inventory evidence';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM "pharmacy_quote_lines" quote_lines
     WHERE quote_lines."quote_id" = order_record."quote_id"
       AND quote_lines."quantity" > COALESCE((
         SELECT SUM(dispense_lines."quantity")
           FROM "prescription_dispense_lines" dispense_lines
           JOIN "prescription_dispense_events" events
             ON events."id" = dispense_lines."dispense_event_id"
          WHERE events."route_id" = order_record."prescription_route_id"
            AND dispense_lines."fill_number" = order_record."fill_number"
            AND dispense_lines."prescription_item_id" = quote_lines."prescription_item_id"
       ), 0)
  ) THEN
    RAISE EXCEPTION 'handoff requires explicit dispense evidence for every quoted line';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
