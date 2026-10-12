BEGIN;

-- Keep database identifiers aligned with the canonical Prisma field names. These
-- changes are metadata-only: referenced columns and referential actions are unchanged.
DO $$
BEGIN
  IF to_regclass('inventory_reservations_provider_reference_key') IS NOT NULL
     AND to_regclass('inventory_reservations_provider_reservation_reference_key') IS NULL THEN
    ALTER INDEX "inventory_reservations_provider_reference_key"
      RENAME TO "inventory_reservations_provider_reservation_reference_key";
  END IF;
END $$;

DO $$
DECLARE
  rename_record RECORD;
BEGIN
  FOR rename_record IN
    SELECT * FROM (VALUES
      ('notification_inbox_items', 'notification_inbox_items_organization_fkey', 'notification_inbox_items_recipient_organization_id_fkey'),
      ('notification_inbox_items', 'notification_inbox_items_principal_fkey', 'notification_inbox_items_recipient_principal_id_fkey'),
      ('notification_inbox_reads', 'notification_inbox_reads_item_fkey', 'notification_inbox_reads_item_id_fkey'),
      ('notification_inbox_reads', 'notification_inbox_reads_principal_fkey', 'notification_inbox_reads_principal_id_fkey'),
      ('pharmacy_operational_settings', 'pharmacy_operational_settings_organization_fkey', 'pharmacy_operational_settings_organization_id_fkey'),
      ('pharmacy_operational_settings', 'pharmacy_operational_settings_updater_fkey', 'pharmacy_operational_settings_updated_by_principal_id_fkey'),
      ('pharmacy_orders', 'pharmacy_orders_acceptor_id_fkey', 'pharmacy_orders_accepted_by_principal_id_fkey'),
      ('pharmacy_orders', 'pharmacy_orders_pharmacy_id_fkey', 'pharmacy_orders_pharmacy_organization_id_fkey'),
      ('pharmacy_orders', 'pharmacy_orders_route_id_fkey', 'pharmacy_orders_prescription_route_id_fkey'),
      ('pharmacy_quote_lines', 'pharmacy_quote_lines_item_id_fkey', 'pharmacy_quote_lines_prescription_item_id_fkey'),
      ('pharmacy_quote_lines', 'pharmacy_quote_lines_substitution_id_fkey', 'pharmacy_quote_lines_substitution_proposal_id_fkey'),
      ('pharmacy_quotes', 'pharmacy_quotes_creator_id_fkey', 'pharmacy_quotes_created_by_principal_id_fkey'),
      ('pharmacy_quotes', 'pharmacy_quotes_pharmacy_id_fkey', 'pharmacy_quotes_pharmacy_organization_id_fkey'),
      ('pharmacy_quotes', 'pharmacy_quotes_route_id_fkey', 'pharmacy_quotes_prescription_route_id_fkey')
    ) AS names(table_name, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = rename_record.table_name::regclass
        AND conname = rename_record.old_name
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = rename_record.table_name::regclass
        AND conname = rename_record.new_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        rename_record.table_name,
        rename_record.old_name,
        rename_record.new_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
