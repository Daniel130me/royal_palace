# Increment 02 completion report — configuration, telemetry, and local dependencies

**Increment:** 02 — Configuration, telemetry, and local dependencies

**Completion commit:** `9acd814` (pushed to `origin/feat_prod`)

**Scope completed:** Added fail-closed typed configuration for web, API, and worker;
safe environment documentation; local PostgreSQL, Redis queue transport, MinIO, and
ClamAV definitions; structured JSON logging and redaction; validated request IDs and
W3C trace propagation; graceful shutdown; bounded readiness probes; protected-
environment transport requirements; and repeatable runtime/test evidence.

**Files/modules changed:** `packages/config` runtime modules and tests; API and worker
bootstrap, dynamic module, health endpoints, and tests; the Next.js proxy and test;
root/local runtime scripts and documentation; `infra/local`; `.env.example`; CI-
compatible prototype test setup; `AGENTS.md`; and the implementation tracker.

**Architecture/ADR impact:** Implements the runtime boundary and local environment
already approved by the controlling plan and ADR 0001. No new production provider is
selected. MinIO is local-only and non-standard because its upstream repository is
archived; production object storage remains private Amazon S3. Redis is the local queue
transport only; the managed production queue remains an approval-gated ADR decision.

**Database migrations and rollback/repair plan:** No production schema or data
migration. PostgreSQL is introduced only as an explicit local dependency and readiness
target; the prototype SQLite database remains isolated under `apps/web`. Rollback is a
Git revert of this increment. Local Compose volumes contain synthetic data and are not
deleted by the normal `local:down` command.

**API contract changes:** API and worker retain `GET /health/live` and
`GET /health/ready`. Readiness now returns only dependency names and `up`/`down` states
for PostgreSQL, Redis queue, object storage, and ClamAV, returning HTTP 503 when any
critical dependency is unavailable. Responses include validated `x-request-id` and
W3C `traceparent` headers.

**Authentication/authorization impact:** None. Prototype authentication remains
unchanged pending Increment 04. Caller-controlled correlation headers are validated
and replaced when malformed; they never affect identity or authorization.

**Privacy/clinical/payment impact:** No clinical or payment behavior changes. Access
logs exclude request bodies, headers, cookies, and URL query values. Pino redacts
configured credential fields; unknown framework log objects are omitted instead of
being stringified where redaction could no longer inspect them. Configuration errors
report field names and validation failures without echoing configured values.

**Queries added or changed, indexes used, and query-count review:** No business query
or index changed. Readiness performs one bounded `SELECT 1`, one Redis `PING`, one
object-storage health request, and one ClamAV `PING` concurrently. The PostgreSQL pool
is capped at two connections. Readiness intentionally does not cache results, avoiding
stale health while remaining suitable for low-frequency orchestrator probes.

**Tests run with exact command and result:**

- `pnpm test` — passed: 46 tests total (configuration 11, API 5, worker 5,
  web/prototype 25); 0 failures.
- Process fail-fast smoke: `node apps/api/dist/main.js` with required settings removed
  — exited 1 with sanitized missing-field diagnostics.
- API process smoke with synthetic unavailable dependency endpoints — liveness 200,
  readiness 503, caller request ID preserved, child traceparent returned, trace ID
  present in request/completion logs, and query sentinel absent from logs.
- `docker compose -f infra/local/compose.yml config --quiet` with synthetic environment
  values — passed. Docker Compose v5.1.4 was available.

**Build/lint/type-check result:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
`pnpm db:validate` passed across all six workspaces. Next.js generated all 46 static/
dynamic pages and both Node services compiled. `pnpm audit --audit-level high`
reported no known vulnerabilities. `pnpm install --frozen-lockfile` and the final
combined `pnpm verify` are rerun immediately before commit.

**Telemetry and alerts added:** JSON logs now include service, environment, version,
request ID, and trace ID. Request lifecycle logs include duration and response status.
Malformed trace/request headers are replaced. No alert destination is configured
because the production observability provider is still an approval-gated Phase 0
decision.

**Deployment order:** Supply validated secrets/configuration; make PostgreSQL, Redis,
object storage, and ClamAV reachable; start API and worker; require liveness and
readiness success before traffic; then start/connect the web BFF. Protected
environments require an approved AWS region, HTTPS object/API endpoints, `rediss`, and
PostgreSQL `sslmode=verify-full`.

**Rollback trigger and procedure:** Trigger on startup regression, log leakage,
incorrect correlation behavior, readiness instability, or inability to build the
preserved prototype. Revert the increment commits and redeploy Increment 01. There is
no data rollback. If local services were started, run `pnpm local:down`; named volumes
remain recoverable.

**Prototype code/routes retired:** None. Increment 02 is cross-cutting foundation only.
The prototype's tracked, synthetic `apps/web/.env`, SQLite routes, simulated auth, and
generic endpoints remain explicitly temporary and are retired by their assigned later
increments.

**Known limitations or deferred work:** Docker Desktop's engine was unavailable on the
implementation host, so the Compose model was statically validated but the complete
four-container stack could not be started here. Healthy readiness is covered by API/
worker HTTP tests; unavailable-dependency behavior is process-smoked. Real staging
telemetry, alerting, distributed trace export, managed queue selection, secret-manager
integration, and restore evidence remain later gated work. MinIO must be reassessed
before Increment 10 and must never be promoted to staging or production.

**Maintainability review:** Confirmed. Configuration, observability, and readiness are
separate typed modules with explicit contracts; duplicated values are named; complex
security choices are documented; all external probes are bounded and parallel;
database connections are capped and closed through Nest lifecycle hooks; tests cover
fail-closed configuration, protected transport, redaction, query removal, request/
trace validation, dependency health, and HTTP status semantics. The implementation is
readable, strict, extendable, query-conscious, and introduces no generic business
abstraction or production provider assumption. The existing per-file prototype test
database setup was replaced with one global, isolated database per run to eliminate
parallel schema races. No known critical/high defect or regression remains in the
changed scope.

**Approval gate requested:** Automatically accepted under the owner's standing
instruction to continue after validation, commit, and push, stopping only for material
product, security, legal, infrastructure-cost, or production-data decisions. Increment
03 may start after the tracker records the successful push.
