BEGIN;

CREATE INDEX "pharmacy_orders_created_idx"
  ON "pharmacy_orders"("created_at" DESC, "id" DESC);
CREATE INDEX "pharmacy_orders_status_created_idx"
  ON "pharmacy_orders"("status", "created_at" DESC, "id" DESC);

COMMIT;
