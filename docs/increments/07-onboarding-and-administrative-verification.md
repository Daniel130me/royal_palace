# Increment 07 — onboarding and administrative verification

## Status

**Implementation complete; remote database/CI evidence pending.** This is the checked
execution record for Increment 07. A checked item means the implementation and its
focused evidence exist. The increment is not closed until the exact pushed commit passes
the PostgreSQL and repository CI gates.

## Architecture checklist

- [x] Add normalized patient, organization, and practitioner application aggregates.
- [x] Enforce the seven-state lifecycle through one transactional domain state machine.
- [x] Add append-only status/decision history with actor, reason category, safe note
      visibility, timestamps, request ID, and correlation ID.
- [x] Add document metadata and fail-closed quarantine states without pretending the
      Increment 10 object-storage/scanning integration exists.
- [x] Keep applicant-private data separate from support-safe list projections and public
      discovery projections.
- [x] Permit support to inspect and prepare reviews, but never approve, reject, or request
      more information.
- [x] Permit administrators alone to make verification decisions; practitioner approval
      must not depend on a facility affiliation.
- [x] Create approved patient, organization, and practitioner records atomically and
      idempotently.
- [x] Add governed administrator profession/specialty catalogue maintenance without
      deleting historical references.
- [x] Extend the signed BFF-to-API session boundary so protected REST routes derive the
      actor from the server-held session rather than browser input.

## API and frontend checklist

- [x] Implement applicant create/read/update/submit/withdraw/requested-information flows.
- [x] Implement bounded support and administrator review queues and detail views.
- [x] Implement support review-start and administrator request-information/approve/reject
      commands.
- [x] Add exact BFF route allowlisting, CSRF protection, generated contracts, and drift
      verification for the protected onboarding API.
- [x] Connect organization onboarding, patient enrollment, practitioner verification,
      support review, and administrator review interfaces to the production API.
- [x] Retire or fail closed the corresponding prototype write routes in protected
      environments.

## Evidence checklist

- [x] Migration clean-install, prior-schema upgrade, rollback/repair, constraints, and
      zero-drift checks pass.
- [x] Authorization matrix proves applicant ownership, support review-only access,
      administrator-only decisions, and manager exclusion.
- [x] Illegal/concurrent transitions fail atomically and every successful decision is
      auditable.
- [x] List queries are bounded, scope predicates execute in PostgreSQL, query counts are
      fixed, and representative plans use intended indexes.
- [x] API, generated-client, BFF, and frontend state tests pass.
- [x] Repository format, lint, strict type-check, test, production build, Prisma, and
      dependency-audit gates pass.
- [x] Completion report records deployment order, rollback procedure, deferred work, and
      the required maintainability/security/performance walkthrough.
- [ ] Conventional commits are pushed to `origin/feat_prod` and the exact remote CI run
      succeeds.

## Non-negotiable carried boundaries

- Managers distribute referral links only; they cannot submit, inspect, edit, review, or
  decide confidential applications. Attribution is implemented in Increment 08.
- Support may prepare reviews and see operational information, but cannot make or imitate
  an administrator decision.
- A hospital has no authority over practitioner verification, profile, specialty, fee,
  or approval state. Facility affiliation is optional descriptive data.
- No implicit country, currency, locale, language, time zone, regulator, identity vendor,
  object-storage vendor, or cloud region may enter the application domain.
- Real file upload, malware scanning, release, and download remain disabled until the
  Increment 10 storage/scanning boundary is implemented and qualified.

## Section 20 completion report

**Increment:** 07 — onboarding and administrative verification.

**Scope completed:** Production application workflows for patients, organizations, and
independent practitioners; support review preparation; administrator-only verification
decisions; governed profession/specialty maintenance; protected BFF/API integration; and
replacement of the affected prototype onboarding interfaces.

**Files/modules changed:** The API-owned PostgreSQL schema, migration, seed, migration and
query-plan verifiers; the capability-scoped `apps/api/src/onboarding` module; identity
request authentication and authorization policies; shared contracts, OpenAPI description,
generated client and signing library; exact Next.js BFF routes; patient, organization,
practitioner, support, and administrator interfaces; tests; workspace dependency policy;
and this execution record.

**Architecture/ADR impact:** No standing ADR is reversed. The implementation follows the
existing modular-monolith, vendor-neutral identity, API-owned PostgreSQL, generated-client,
and global-deployability decisions. Onboarding is an isolated capability with domain,
application, infrastructure, and presentation boundaries rather than a generic CRUD layer.

**Database migrations and rollback/repair plan:** Migration
`20260930110000_onboarding_and_verification` adds normalized application aggregates,
typed private details, requested taxonomy relations, document metadata, immutable history,
approved patient resources, organization registration, and practitioner-private credential
data. Database constraints and triggers enforce aggregate type, lifecycle, uniqueness,
history immutability, specialty hierarchy integrity, and typed-detail completeness. Deploy
the migration once from the controlled migration job before rolling out API or web code.
If deployment fails before use, roll back application binaries and restore the pre-migration
database snapshot. After any committed real-data write, do not destructively reverse the
schema: stop writes, restore through the approved point-in-time recovery procedure, or
apply a reviewed forward repair migration. The verifier rehearses clean install, upgrade,
repeatability, constraints, repair, and zero drift in CI.

**API contract changes:** Added protected applicant, support-review, administrator-review,
and administrator catalogue endpoints under the versioned API. The OpenAPI 3.1 onboarding
contract generates the client consumed by the web service boundary. Lists are bounded and
use versioned, filter-bound keyset cursors.

**Authentication/authorization impact:** Protected API requests now require a signed
BFF-to-API envelope bound to an opaque server-held session reference. Actor identity is
resolved server-side. Applicants can access only their own non-public application data;
support can inspect submitted work and start review but cannot decide it; administrators
alone can request information, approve, reject, and maintain catalogues; managers and
organizations receive no confidential applicant authority. CSRF and exact route/method
allowlists apply at the BFF boundary. Authorization remains default-deny and audited.

**Privacy/clinical/payment impact:** Drafts remain applicant-private. Support projections
contain only review-required information and public discovery still receives no onboarding
private data. Document bytes cannot be uploaded or released before Increment 10; metadata
remains fail-closed in quarantine states. Practitioner approval is independent of a
facility, selected affiliations are revalidated and descriptive only, and hospitals cannot
control practitioner verification, specialty, profile, or fees. Catalogue content still
requires qualified clinical governance before real-data launch. No payment behavior or
country/currency default was introduced.

**Queries added or changed, indexes used, and query-count review:** Review queues and
applicant history use bounded keyset pagination with fixed projection shapes. The review
index follows `status, createdAt DESC, id DESC`; applicant history uses the application/time
index. Catalogue lists are bounded to 100 records and hierarchy checks use narrow indexed
lookups. Approval validates selected catalogue records in bounded queries inside the same
transaction. The local PostgreSQL gate seeded 10,000 applications and both the review and
applicant-history queries naturally used their intended indexes. The exact PostgreSQL 17.6
remote evidence is intentionally left unchecked until the pushed repair passes.

**Tests run with exact command and result:** `pnpm verify` passed locally after the final
dependency resolution: formatting; eight-package lint and strict type-check; API tests
(19 files, 175 tests); web tests (5 files, 33 tests); worker and shared-package tests; all
eight production builds; generated-client drift checks; 56 Next.js routes and standalone
packaging; and both Prisma schema validations. `pnpm audit --audit-level moderate` reported
`No known vulnerabilities found`. The PostgreSQL commands `pnpm db:migrate:verify`,
`db:migrate:deploy`, `db:drift:check`, two `db:seed` executions, `db:discovery:verify`, and
`pnpm db:query-plans` passed against a disposable native PostgreSQL 18 database.

**Build/lint/type-check result:** Passed with zero lint, type, generated-client, build, or
schema-validation failures.

**Telemetry and alerts added:** Existing request IDs and W3C trace propagation flow through
the signed boundary; application history persists the correlation identifier. No new vendor
dashboard or production alert is claimed in this increment because production observability
provider selection remains a material decision.

**Deployment order:** Back up and verify restore readiness; run the controlled PostgreSQL
migration; deploy the API; run health/readiness and protected-contract smoke checks; deploy
the web BFF and frontend; seed only synthetic non-production environments when explicitly
enabled; then observe error, authorization-denial, transition-conflict, and latency signals
before enabling the workflows.

**Rollback trigger and procedure:** Roll back on migration failure, schema drift, session
signature/authentication regression, authorization leakage, invalid state transition,
approval atomicity failure, material latency regression, or error-budget breach. Disable
the affected routes, roll web/API binaries back together, and follow the database recovery
rule above. Never delete decision history or approved resources to simulate reversal.

**Prototype code/routes retired:** Production/staging proxy rules fail closed the migrated
prototype onboarding and verification writes. Legacy prototype source remains local-only for
remaining presentation review and must be removed as its owning vertical slices migrate.

**Known limitations or deferred work:** Referral attribution belongs to Increment 08;
appointments/payments to Increment 09; object storage, malware scanning, notifications, and
durable workers to Increment 10; production identity-provider qualification to mandatory
Increment 04B; and real catalogue/public-credential use remains gated by clinical, privacy,
and legal approval. Docker Desktop remains unavailable, but the complete database pipeline
passed against a disposable native PostgreSQL 18 database. The exact PostgreSQL 17.6 CI run
must still pass before this increment is closed.

**Maintainability review:** Confirmed. Names and module boundaries are readable; domain
transitions and database invariants are centralized; non-obvious security and constraint
logic is documented; normalized aggregates and explicit ports are easy to extend without a
generic repository; generated contracts prevent drift; and catalogue/history preservation
supports later features without destructive rewrites. No unexplained magic market values,
hard-coded country/currency/vendor assumptions, unbounded lists, N+1 projections, or
client-authoritative identity checks were added. Security is fail-closed, queries are
bounded/indexed, audit history is append-only, and the dependency audit is clean. The
deliberately incomplete storage/scanning, provider qualification, clinical governance, and
legacy-prototype retirement boundaries are explicitly flagged rather than presented as
production-ready. The first remote run also found a PL/pgSQL variable/column collision in
the deferred typed-detail trigger; the trigger was corrected and the entire disposable
database pipeline was rerun successfully instead of suppressing or bypassing the invariant.

**Approval gate requested:** None. The product owner previously authorized autonomous
delivery through the approved sequence. Increment 07 will be marked complete only after the
implementation commit is pushed and its exact remote CI run succeeds.
