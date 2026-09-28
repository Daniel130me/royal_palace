# Increment 04A — Vendor-neutral identity and secure BFF sessions

## Completion report

**Increment:** 04A — Vendor-neutral identity and secure BFF session foundation

**Implementation commit:** `e978076` (`feat(identity): establish vendor-neutral secure sessions`)

**Architecture decision:**
[`ADR 0002`](../adr/0002-vendor-neutral-identity-and-provider-qualification.md)

**Scope completed:** Replaced the active browser-trusted prototype authentication path
with a provider-neutral OpenID Connect boundary, application-owned principals and
sessions, encrypted BFF cookies, server-derived roles and memberships, CSRF/origin
protection, refresh/logout/step-up flows, and audited revocation. Production identity
provider selection and qualification remains deliberately incomplete under Increment
04B.

**Files/modules changed:**

- `apps/api/src/identity/*` — domain ports, application service, OIDC adapter,
  PostgreSQL repository, signed internal controller, and request guard.
- `apps/api/prisma/schema.prisma` and
  `20260928143000_vendor_neutral_identity_sessions` — external identities, one-time
  OIDC transactions, and revocable sessions.
- `apps/web/src/app/api/bff/auth/*` and `apps/web/src/lib/auth/bff.ts` — same-origin BFF
  login, callback, current session, refresh, and logout endpoints.
- `packages/security/*` — versioned AES-256-GCM secret envelopes, HMAC-authenticated
  internal requests, hashing, constant-time comparison, and random values.
- `packages/contracts/*` and `packages/config/*` — provider-neutral session contracts
  and fail-closed identity/BFF configuration.
- Prototype authentication UI, request proxy, session hydration, test harnesses,
  package manifests, generated Prisma client, and lockfile.

**Architecture/ADR impact:** Implements ADR 0002. Provider discovery and raw claims
remain inside `OpenIdClientAdapter`; the identity application service consumes only a
small normalized contract. The browser talks to same-origin BFF endpoints, the BFF
authenticates calls to the API with timestamped HMAC signatures, and only the API owns
identity/session persistence. Application role and membership records—not provider
groups, mutable claims, URL state, headers, or browser storage—grant access. A Graphify
boundary review was used to keep the provider adapter, BFF, identity service, repository,
and domain contracts directional rather than coupling UI or policy code to the OIDC
library.

**Database migration and rollback/repair plan:** The forward migration creates
`external_identities`, `oidc_login_transactions`, and `auth_sessions`, migrates every
existing `(issuer, subject)` binding without changing its principal ID, then removes
provider identity fields from principals. Uniqueness, status/date consistency, token
encryption-key presence, SHA-256 formats, expiry ordering, revocation consistency,
positive versions, foreign keys, and cleanup/lookup indexes are database-enforced. A
clean install, representative prior-schema upgrade, deliberately failed transaction,
repair, and redeploy passed. Rollback keeps the backward-compatible expanded schema and
rolls application code back; destructive identity contraction requires a separately
reviewed forward migration and is prohibited as an emergency response.

**API contract changes:** Added internal signed API operations for login start/callback,
current session, refresh, logout, and principal-wide administrative session revocation.
Added same-origin BFF routes under `/api/bff/auth/*`. Browser responses expose internal
principal IDs, authorized roles/memberships, assurance, and expiries, but never provider
access/refresh tokens or credential material.

**Authentication/authorization impact:** Authorization Code + PKCE uses state, nonce,
issuer/audience/signature validation, exact callback validation, single-use login
transactions, and no email-based auto-linking. Sessions have idle and absolute expiry,
principal/external-identity status checks, encrypted provider tokens with versioned key
IDs, periodic last-seen writes, local-first logout, refresh-token rotation support, and
audited revocation. Privileged roles require both the configured canonical assurance
context and a recent provider-authenticated time; missing `auth_time` fails closed.
Administrator-wide revocation also requires a recent stepped-up administrator session.
Increment 05 will expose this narrow operation only through named authorization policy.

**Browser and CSRF boundary:** The browser receives an encrypted opaque session
reference in an `HttpOnly`, `SameSite=Lax` cookie and a separate CSRF token. Every
state-changing application API call requires the exact configured origin plus a
constant-time double-submit token comparison. Protected environments require HTTPS,
which automatically selects `__Host-` cookies with `Secure`; the `rp-dev-*` insecure
cookie names are an explicitly non-standard local-HTTP exception and cannot be selected
by staging/production configuration.

**Privacy/clinical/payment impact:** No real, clinical, or payment data was introduced.
Provider tokens are encrypted with authenticated encryption and are never returned to
the browser or logged. Login state is hashed; nonce and PKCE verifier are encrypted.
The compatibility manager routes now derive identity from the secure session, but their
prototype SQLite projections and obsolete portfolio semantics remain quarantined until
Increment 08 and are not a production data path.

**Queries and performance review:** Current-session retrieval is a bounded lookup that
selects only session, principal, effective membership, and effective role fields. It
touches `last_seen_at` at most once every five minutes rather than writing per request.
External identity resolution is unique on `(issuer, subject)` and deliberately uses a
second write only after active identity/principal checks. Administrative revocation is
one indexed set update plus one immutable audit event, not one query per session.
`EXPLAIN (ANALYZE, BUFFERS)` observed `auth_sessions_pkey` over 10,000 representative
sessions (0.042 ms local execution); the existing hospital, audit, and outbox plans also
retained their required indexes. These local PostgreSQL 18 timings are evidence of plan
shape, not production latency promises; CI repeats the checks on PostgreSQL 17.6.

**Tests and validation:**

- `pnpm verify` — passed format, zero-warning lint, strict type checks, 68 automated
  tests, all package builds, the 49-route Next.js production build, standalone asset
  packaging, and both Prisma schema validations.
- API identity tests cover encrypted/hashed transaction material, single-use rejection,
  assurance rejection, authentication freshness, provider-outage logout, and audited
  administrator revocation.
- A real local `oidc-provider` integration test covers discovery, Authorization Code,
  PKCE, state, nonce, signed ID-token validation, issuer validation, and normalized
  subject extraction. Its development adapter, keys, interactions, and notices are
  test-only and never a deployment fallback.
- BFF/security tests cover AES-GCM key separation/rotation, cookie tamper rejection,
  HMAC body/path/request binding and timestamp expiry, exact-origin CSRF, and proxy
  rejection.
- `pnpm db:migrate:verify`, migration deploy, schema-drift check, and
  `pnpm db:query-plans` passed against a disposable local PostgreSQL 18 database.
- Synthetic seed ran twice idempotently; seed execution without the explicit synthetic
  guard failed before database access as designed.
- `pnpm install --frozen-lockfile` passed; `pnpm audit --audit-level high` reported no
  known vulnerabilities.
- GitHub Actions run
  [`36418392274`](https://github.com/Daniel130me/royal_palace/actions/runs/36418392274)
  passed for implementation commit `e978076`.
- A later CI replay exposed a probabilistic ciphertext-tamper assertion: changing the
  final Base64URL character can preserve the decoded bytes. The regression now flips an
  authenticated-tag byte deterministically, and the production parser additionally
  rejects non-canonical encodings, invalid IV/tag lengths, and unsafe key identifiers.

**Telemetry and alerts added:** Identity session creation and revocation write immutable
audit events with request IDs. Existing structured request logging carries request and
trace correlation without bodies, cookies, query values, or provider tokens. Provider
revocation/end-session failure is logged only as a safe operational warning after local
revocation. Provider-specific abuse, recovery, outage, and alert qualification belongs
to the mandatory 04B gate.

**Deployment order:** Apply the forward migration once from a controlled migration job;
configure independent identity-token, BFF-cookie, and internal-HMAC keys; deploy the API;
then deploy the web BFF. Do not place non-synthetic users in protected staging. Local
HTTP and the synthetic provider are test/development modes only. Rotation adds the new
key to the read ring before making it active; remove old keys only after every envelope
and cookie using them has expired or been rotated.

**Rollback trigger and procedure:** Stop or roll back on migration checksum/drift,
cookie decryption, OIDC validation, refresh, revocation, assurance, or authorization
regression. Roll web back first, then API, while leaving the additive schema. Revoke
affected sessions if key or session integrity is in doubt. Never restore plaintext
password or browser-trusted session code. Provider outage still permits local logout;
new authentication may be unavailable until the provider recovers.

**Prototype code/routes retired:** Removed the plaintext password column and seeded
passwords from prototype SQLite, hard-coded approval credentials, the custom login and
signup action routes, `next-auth`, persona switching, `royalPalaceSession`,
`x-rp-session`, and client-supplied role/profile authorization. Account security UI now
states that credential, MFA, and recovery ceremonies belong to the identity provider.

**Known limitations and deliberately deferred work:**

- **Increment 04B remains mandatory and incomplete.** Provider/tenant/region/legal/cost,
  privileged MFA and recovery policy, key/refresh reuse behavior, abuse/rate limits,
  outage handling, and exit rehearsal must pass before non-synthetic protected staging,
  real-user identity migration, Increment 12, or public launch.
- Increment 05 must place every protected business route behind named default-deny
  policy; 04A establishes identity and assurance but does not claim the matrix complete.
- The prototype manager routes still use a clearly marked SQLite compatibility profile
  and obsolete portfolio projections. Increment 08 replaces them with referral
  attribution and minimal visibility.
- Expired session/login-transaction physical cleanup and retention scheduling belongs
  to the durable worker/retention implementation. Expired rows are already unusable and
  indexed for bounded cleanup, but deletion evidence must be completed before launch.

**Maintainability and standards review:** Confirmed cohesive identity/application/
infrastructure/presentation boundaries, narrow contracts, provider SDK isolation,
explicit dependency injection, readable names, comments only for non-obvious security
or platform behavior, and no generic CRUD or provider-specific policy. Configuration
fails closed; secrets and durations are versioned/configured rather than magic values;
queries are bounded and indexed; security decisions are enforced both in service logic
and database constraints. No known unresolved critical/high defect remains in 04A. The
non-standard local insecure-cookie exception, local synthetic provider warnings,
prototype SQLite compatibility boundary, and deferred cleanup/provider qualification
are explicitly flagged rather than presented as production-ready.

**Next increment:** Increment 05 — named default-deny policy engine and audit boundary.
Increment 04B stays visible as a separate release gate and is not silently absorbed into
later work.
