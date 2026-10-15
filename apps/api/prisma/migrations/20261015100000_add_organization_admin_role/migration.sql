-- PostgreSQL requires a newly added enum value to be committed before it can be
-- referenced by later data migrations. Keep this migration separate from the
-- organization-team tables and founder-role backfill.
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'ORGANIZATION_ADMIN';
