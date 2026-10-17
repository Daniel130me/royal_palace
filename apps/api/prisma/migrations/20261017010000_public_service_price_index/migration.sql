BEGIN;

-- Supports the bounded public catalogue read without indexing payout or actor data.
CREATE INDEX "service_prices_public_effective_idx"
ON "service_prices" ("status", "effective_from", "id");

COMMIT;
