BEGIN;

-- Cursor-based pharmacy work queues sort by creation time without a status
-- predicate. These indexes avoid an in-memory sort as organization history grows.
CREATE INDEX "pharmacy_quotes_org_created_idx"
  ON "pharmacy_quotes" ("pharmacy_organization_id", "created_at" DESC, "id" DESC);

CREATE INDEX "pharmacy_orders_org_created_idx"
  ON "pharmacy_orders" ("pharmacy_organization_id", "created_at" DESC, "id" DESC);

COMMIT;
