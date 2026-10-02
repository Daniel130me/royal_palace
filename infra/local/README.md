# Local runtime dependencies

This stack is for synthetic development data only. It provides PostgreSQL, Redis (including the local queue transport), S3-compatible object storage, and ClamAV.

1. Copy `.env.example` to `.env.local` at the repository root.
2. Fill every development setting except `AWS_REGION`; never reuse staging or production credentials.
3. Run `pnpm local:up`.
4. Start the processes with `pnpm dev`.
5. Use `pnpm local:down` to stop containers. Named volumes are retained unless deliberately removed by an operator.

The API and worker expose `/health/live` for process liveness and `/health/ready` for
their direct dependencies. Both check PostgreSQL, Redis, and object storage. Only the
local/staging worker depends on ClamAV, so a scanner outage does not unnecessarily remove
the API from service while uploads remain safely quarantined.

## Local object storage boundary

The development-only emulator is the pinned RustFS 1.0.0 image from the project's
GitHub Container Registry. It replaced the archived MinIO source build, which no
longer reproduced against its upstream release artifacts. RustFS runs only on
loopback ports with synthetic data. It is not the production storage choice; ADR
0001 keeps protected document storage in private Amazon S3. Its S3 feature subset
is verified by the opt-in local document contract test, but staging must still
exercise the actual configured S3 service before any release.

After `local:up`, the storage bootstrap creates separate private quarantine and
clean buckets, enables versioning, and configures an explicit browser-origin CORS
rule for direct uploads. Set `WEB_ORIGIN` to the exact local frontend origin.
