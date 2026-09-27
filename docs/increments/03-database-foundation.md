# Increment 03 — Database foundation

## Completion report

**Increment:** 03 — Database foundation

**Scope completed:** Established the API-owned PostgreSQL data boundary, two-step
transactional migration history, foundational identity/organization/authorization and
reliability records, synthetic-only seed, migration/repair/drift verification, and
representative index-plan checks. The prototype SQLite schema was not converted or
promoted.

**Files/modules changed:**

- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/*`
- `apps/api/prisma/seed.ts`
- `apps/api/src/platform/database/*` and `apps/api/src/platform/identifiers.ts`
- `apps/api/scripts/*` database validation and evidence scripts
- `apps/api/tests/identifiers.test.ts`
- API/root package scripts, lockfile, `.env.example`, `.gitignore`
- `.github/workflows/ci.yml`
- `apps/web/package.json` (removed the destructive prototype `db:push` command)
- `docs/IMPLEMENTATION_PROGRESS.md`

**Architecture/ADR impact:** Implements ADR 0001's PostgreSQL decision inside the new
API boundary. Prisma uses its JavaScript engine with the pinned PostgreSQL driver
adapter, avoiding a platform-specific native query-engine artifact. UUIDv7 values are
generated in application code. Database access remains an infrastructure module for
capability-owned repositories; no generic CRUD repository or cross-domain persistence
API was introduced. No new ADR was required.

**Database migrations and rollback/repair plan:** Two additive migrations separate
identity/organization foundations from audit/idempotency/event reliability records.
Each migration explicitly uses `BEGIN`/`COMMIT`. Automated verification proves a clean
install, upgrade from the first migration, recovery after a deliberately failed
transaction, and an idempotent redeploy. As these are additive foundations with no
production consumers or production data, application rollback leaves the expanded
schema in place. A migration failure triggers application deployment stop; repair is
restore/retry after root-cause review, using `prisma migrate resolve` only with an
approved runbook and verified database state. Destructive down migrations are not an
automatic rollback mechanism.

**API contract changes:** None. No HTTP resource or response contract was added.

**Authentication/authorization impact:** Added external identity references,
effective-dated memberships, and platform/organization-scoped role assignments. These
are storage foundations only; Increment 04 selects the managed identity provider and
Increment 05 enforces policies. Existing prototype authentication is not made
production-safe by this increment.

**Privacy/clinical/payment impact:** No real patient, clinical, credential, or payment
data was used. Audit metadata is object-only and capped at 8 KiB; event envelopes are
capped at 256 KiB. Audit facts are append-only, and event identity/payload facts are
protected from mutation. Detailed data-classification and retention decisions remain
at their existing approval gates.

**Queries added or changed, indexes used, and query-count review:** No runtime endpoint
query was added. `EXPLAIN (ANALYZE, BUFFERS)` checks run against rollback-only synthetic
data and fail unless the expected compound/partial index is observed:

| Access path | Representative rows | Required index | Local execution |
| --- | ---: | --- | ---: |
| Hospital discovery cursor | 20,000 organizations | `organizations_type_status_name_id_idx` | 0.106 ms |
| Organization audit cursor | 12,000 audit events | `audit_events_org_occurred_id_idx` | 0.044 ms |
| Pending outbox batch | 10,000 outbox events | `outbox_events_pending_available_idx` | 0.132 ms |

All three are one bounded query per page/batch and select only required columns. The
numbers are local PostgreSQL 18 evidence, not production latency claims. CI repeats the
index assertions on PostgreSQL 17.6.

**Tests run with exact command and result:**

- `pnpm db:migrate:verify` — passed clean install, prior-schema upgrade,
  transactional-repair rehearsal, partial uniqueness, hash validation, and append-only
  audit constraints.
- `pnpm --filter @royal-palace/api db:migrate:deploy` — both migrations applied.
- `pnpm --filter @royal-palace/api db:drift:check` — no Prisma model drift detected.
- `pnpm db:query-plans` — all three required indexes observed.
- `pnpm --filter @royal-palace/api db:seed` twice — passed and remained idempotent.
- Production-mode seed invocation — rejected before database access as required.
- `pnpm verify` — passed; 48 automated tests passed across the workspace (API 7,
  configuration 11, web 25, worker 5), with no test failure.
- `pnpm install --frozen-lockfile` — passed.
- `pnpm audit --audit-level high` — no known vulnerabilities.

**Build/lint/type-check result:** Workspace formatting, ESLint, strict TypeScript,
tests, API/worker TypeScript builds, Next.js production build, and both Prisma schema
validations passed.

**Telemetry and alerts added:** No runtime telemetry was required because no endpoint
or background consumer was introduced. CI now produces explicit migration, drift, and
query-plan failure evidence. Production database metrics/alerts remain infrastructure
work after environment decisions.

**Deployment order:** Run the migrations once as the controlled release migration job,
then deploy the API generated from the same schema. Do not run migrations from every
application replica. The schema expansion is backward-compatible with the current API,
worker, and web application because they do not yet consume these tables.

**Rollback trigger and procedure:** Stop deployment on migration checksum failure,
constraint failure, drift, or an unexpected query plan. Leave successfully expanded
tables in place and roll the application back. For a failed atomic migration, diagnose
on a restored/synthetic copy, correct the forward migration, and redeploy. Restore from
the verified backup if a production migration ever affects data; that operation remains
blocked until production backup/restore and data-migration approvals exist.

**Prototype code/routes retired:** Removed the prototype `prisma db push
--accept-data-loss` package command. No prototype route was retired because endpoint
replacement begins with later vertical slices. Prototype SQLite remains quarantined
under `apps/web` and is never used by the production API boundary.

**Known limitations or deferred work:** Managed identity, policy enforcement, approved
production region/infrastructure, backup/restore evidence, data retention, and every
domain-specific schema remain in later increments or explicit approval gates. Docker
Desktop was unavailable; local database evidence used disposable PostgreSQL 18, while
the committed CI job pins PostgreSQL 17.6. Prisma cannot represent PostgreSQL CHECK
constraints, partial indexes, or immutability triggers in its model language; these are
therefore explicit reviewed migration SQL and are covered by executable verification.

**Maintainability review:** Confirmed readable names and cohesive files; explicit
database and capability boundaries; comments only for non-obvious security/migration
intent; no generic CRUD, speculative abstraction, hidden environment assumption, or
unexplained magic application value. Configuration and destructive verification fail
closed. Foreign keys, enums, checks, effective dates, optimistic versions, immutable
facts, partial uniqueness, bounded payloads, cursor-aligned indexes, and guarded
synthetic data support safe extension. The implementation adds no N+1 or unbounded
runtime query and no known unresolved critical/high defect in scope.

**Approval gate requested:** No manual pause requested under the product owner's
standing authorization. Proceed to Increment 04 unless a material identity-provider,
security, legal, infrastructure-cost, or production-data decision is reached.
