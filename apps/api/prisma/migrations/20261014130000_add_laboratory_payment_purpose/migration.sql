BEGIN;

-- PostgreSQL requires a newly added enum value to be committed before it can be
-- referenced by constraints and application writes. Keep this migration separate.
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'LABORATORY_BOOKING';

COMMIT;
