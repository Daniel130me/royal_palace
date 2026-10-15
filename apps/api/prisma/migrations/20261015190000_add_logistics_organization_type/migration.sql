BEGIN;

-- PostgreSQL requires a newly added enum value to commit before later migrations
-- can use it in constraints, functions, or data.
ALTER TYPE "OrganizationType" ADD VALUE IF NOT EXISTS 'LOGISTICS';

COMMIT;
