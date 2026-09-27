# Local runtime dependencies

This stack is for synthetic development data only. It provides PostgreSQL, Redis (including the local queue transport), S3-compatible object storage, and ClamAV.

1. Copy `.env.example` to `.env.local` at the repository root.
2. Fill every development setting except `AWS_REGION`; never reuse staging or production credentials.
3. Run `pnpm local:up`.
4. Start the processes with `pnpm dev`.
5. Use `pnpm local:down` to stop containers. Named volumes are retained unless deliberately removed by an operator.

The API and worker expose `/health/live` for process liveness and `/health/ready` for PostgreSQL, Redis queue, object-storage, and ClamAV dependency status.

## MinIO maintenance warning

The MinIO community repository was archived in April 2026. Its final security release directs container users to build from source, so this Compose stack builds exact commit `9e49d5e` (release `RELEASE.2025-10-15T17-29-55Z`) instead of relying on a mutable or withdrawn public image. This is a local synthetic-data emulator only; production remains private Amazon S3 under ADR 0001. Reassess the local emulator before Increment 10 rather than adopting an unmaintained MinIO build for staging or production.

The quarantine bucket is intentionally created by the storage bootstrap introduced with the upload subsystem in Increment 10. Until then, use the local console only for connectivity experiments.
