BEGIN;

CREATE INDEX "payments_created_id_idx"
  ON "payments"("created_at" DESC, "id" DESC);

COMMIT;
