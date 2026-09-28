# Increment 05 — Policy engine and audit boundary

## Completion report

**Increment:** 05 — Policy engine and audit boundary

**Implementation commit:** `a2fbd29` (`feat(authorization): enforce named default-deny policies`)

**Scope completed:** Added a provider-neutral, strongly typed RBAC/ABAC boundary before
production business endpoints multiply. Named policies cover organization visibility,
application review and decisions, patient and clinical access, manager tickets and
earnings, patient payment amounts, role administration, and principal-wide session
revocation. Unknown policy, missing identity, wrong scope, unrelated objects, absent
consent/assignment, excessive disclosure, and unapproved roles deny by default.

**Architecture:** The authorization capability is split into domain policy types and a
pure policy engine, an application service that enforces and audits decisions, a Prisma
audit adapter, and presentation metadata used by protected-route inventory tests.
Provider claims and SDKs do not enter this capability. The application service consumes
only the server-derived `CurrentSession`; controllers and request bodies cannot invent
roles or memberships. The database/config module is now a single process-wide Nest
module so future capability repositories share one Prisma pool while continuing to
keep Prisma behind capability-owned adapters.

**Authorization and privacy rules:** Platform roles and organization-membership roles
remain distinct. Patient self-access is object-bound. Clinician access requires the
matching organization membership, active care assignment, and active consent. Support
clinical access is redacted by default. Only administrators decide applications and
administer roles. Managers can see only their own earnings and escalate their own
tickets with minimal disclosure; they cannot see patient payment amounts, clinical
records, full patient data, or full organization data. Finance and administrator access
to patient payment amounts is explicit rather than inherited from a broad role check.

**Audit boundary:** Every protected allow or deny is appended before the operation may
continue. Audit storage failure fails the request closed. Records contain a versioned
policy name, stable reason code, effective role, server-derived actor, request and
correlation identifiers, and only the resource scope needed for investigation. The
existing PostgreSQL trigger rejects updates and deletes; a live validation inserted an
authorization fact and confirmed mutation failed with `audit events are append-only`.
The administrative session-revocation repository continues to append the separate
business-operation result in its transaction.

**Route boundary:** The route inventory is documented in
[`authorization-route-inventory.md`](../security/authorization-route-inventory.md).
The administrative principal-revocation controller is marked with
`REVOKE_PRINCIPAL_SESSIONS` and its application service enforces that policy. Identity
login/current-session/refresh/logout routes remain narrowly classified authentication
lifecycle operations protected by BFF HMAC and opaque session possession. Historical
Next.js prototype APIs are explicitly non-production: the proxy returns
`prototype_route_disabled` for every unmigrated route in staging and production. Later
slices must add individual production BFF routes to the exact allowlist only after the
API use case, policy, projection, and tests exist.

**Database/migration impact:** No schema migration was required because Increment 03
already created the constrained, indexed, append-only `audit_events` table. PostgreSQL
18 validation passed clean install, prior-schema upgrade, deliberately failed
transaction repair, deploy, schema drift, constraints, immutable-audit behavior, and
representative query plans. CI repeats migration and plan validation on PostgreSQL
17.6. Rollback removes the authorization integration and protected-route allowlist but
leaves the additive audit facts and existing schema intact; audit history must never be
deleted as part of rollback.

**Queries and performance:** A policy decision is pure and executes no database query.
A protected decision appends exactly one audit row; it never performs a query per role
or membership. Authentication continues to use one bounded session/principal/
membership projection with its five-minute write throttle. The protected administrative
path therefore has a fixed query shape rather than N+1 behavior. A 100,000-iteration
local policy microbenchmark observed p50 0.1 μs, p95 0.6 μs, and p99 1.0 μs. These are
decision-engine measurements, not production endpoint latency promises. Representative
PostgreSQL plans retained their required indexes: active session 0.193 ms, hospital
discovery 0.518 ms, organization audit cursor 0.222 ms, and pending outbox batch 0.179
ms on the local validation host.

**Tests and validation:** `pnpm verify` passed formatting, zero-warning lint, strict
type checks, 178 automated tests, all package builds, the 49-route Next.js production
build, standalone packaging, and both Prisma schema validations. The API suite contains
100 exhaustive role-policy combinations plus focused ownership, organization scope,
patient relationship, consent, assignment, clinical redaction, manager privacy,
direct-object-reference, audit failure, and controller-policy inventory cases. Frozen
lockfile install passed and `pnpm audit --audit-level high` reported no known
vulnerabilities. GitHub Actions run
[`36454364884`](https://github.com/Daniel130me/royal_palace/actions/runs/36454364884)
passed for `a2fbd29`.

**Telemetry:** Protected decisions carry request/correlation IDs into immutable audit
facts. Attempts to reach disabled prototype APIs in protected environments emit a safe
structured warning with environment, method, path, request ID, trace ID, service, and
version; bodies, cookies, headers, and query values are excluded.

**Known limitations and deliberately deferred work:**

- Increment 04B is still mandatory before non-synthetic protected staging, real-user
  migration, Increment 12, or launch.
- The policy contexts define the required authorization evidence; later domain slices
  must derive ownership, consent, assignment, and disclosure attributes from bounded
  repositories rather than accept them from clients.
- Prototype API source remains for local/test presentation review but is unreachable in
  staging/production. Each route is retired as its production vertical slice lands.
- Emergency/break-glass clinical access and its legal/clinical policy remain a material
  Phase 0 decision; no emergency bypass was invented.

**Maintainability and standards review:** Confirmed capability boundaries, explicit
dependency injection, versioned policy semantics, exhaustive tables rather than nested
controller role checks, stable reason codes, immutable audit evidence, bounded query
shape, and exact protected-route allowlisting. No provider-specific authorization,
generic CRUD permission, browser-supplied role, broad prefix allowlist, silent fallback,
or magic credential was introduced. The stale/incomplete local Graphify graph was not
used as architectural evidence; current source, schemas, tests, and runtime validation
were used instead. Non-standard prototype routes remain clearly flagged and fail closed
outside development/test.

**Next increment:** Increment 06 — public discovery vertical slice. Increment 04B
remains visible and mandatory as a separate release gate.
