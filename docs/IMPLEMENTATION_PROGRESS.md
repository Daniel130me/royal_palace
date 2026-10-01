# Production implementation progress

**Controlling specification:**
[`PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md`](./PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md)

**Purpose:** This is the checked execution tracker for the controlling plan. It does
not replace or reinterpret that plan. Section 9 defines the strategic phases; Section
19 defines the mandatory implementation order. Update this file in the same commit
that completes an increment.

## Status legend

- `[x]` complete, validated, committed, and pushed
- `[~]` actively being implemented; not yet accepted as complete
- `[ ]` not started
- `[!]` blocked by a material decision or external dependency

## Strategic phase status

- `[~]` **Phase 0 — Scope, safety, and production design.** The current-state baseline
  and ADR 0001 are complete. Threat modelling, NDPA/DPIA work, clinical review, final
  role/field matrix approval, SLO/RTO/RPO approval, deployment region/data-residency
  approval, and the identity/payment/queue/observability ADRs remain open. Development
  foundation work may continue; these items block their relevant production work and
  public launch.
- `[~]` **Phase 1 — Engineering and infrastructure foundation.** Increments 01–03 are
  complete. Managed cloud provisioning and deployment/restore
  evidence remain future work and require the relevant Phase 0 decisions.
- `[~]` **Phase 2 — Identity, sessions, and authorization.** Increments 04A and 05 are
  complete.
  Production-provider qualification is tracked separately as the deferred, mandatory
  Increment 04B gate.
- `[~]` **Phase 3 — PostgreSQL domain foundation.** Increment 03 established the
  foundation; domain models will be extended by each later vertical slice.
- `[~]` **Phase 4 — Production vertical slices and frontend connection.** Increment 06
  is complete. The remaining production slices are delivered by Increments 07–09 and
  11.
- `[ ]` **Phase 5 — Payments, files, and asynchronous integrations.** Delivered by
  Increments 09–10 and relevant Increment 11 slices.
- `[ ]` **Phase 6 — Clinical integrity and privacy operations.** Delivered by the
  clinical portions of Increment 11 and release qualification.
- `[ ]` **Phase 7 — Security, reliability, and performance qualification.** Delivered
  by Increment 12.
- `[ ]` **Phase 8 — Migration, controlled launch, and rollback.** Delivered by
  Increment 12.
- `[ ]` **Phase 9 — Post-launch operation.** Begins after controlled launch.

## Exact delivery sequence

- `[x]` **Increment 00 — Protect the current baseline**
  - Evidence: [`current-state-baseline.md`](./current-state-baseline.md)
  - Completion commits: `9474f39`, `243b2a8`, `48f8ffc`
- `[x]` **Increment 01 — Workspace and quality gates**
  - Evidence:
    [`increments/01-workspace-and-quality-gates.md`](./increments/01-workspace-and-quality-gates.md)
  - Completion commit: `e9c3caf`
- `[x]` **Increment 02 — Configuration, telemetry, and local dependencies**
  - Completion commit: `9acd814`
  - `[x]` Typed startup configuration and fail-closed validation implemented.
  - `[x]` Safe root `.env.example` added.
  - `[x]` Local PostgreSQL, Redis, MinIO, and ClamAV definitions added.
  - `[x]` Structured JSON logging, redaction, request IDs, and trace propagation
    implemented.
  - `[x]` Graceful shutdown and bounded dependency readiness implemented.
  - `[x]` Unit and HTTP tests added for configuration, telemetry, and readiness.
  - `[x]` Frozen-lockfile install, format, type-check, lint, test, build, database
    validation, and dependency-audit gates pass on the final tree.
  - `[x]` Static Compose validation and available runtime smoke tests are recorded.
  - `[x]` Section 20 completion report is added.
  - `[x]` Increment is committed and pushed to `origin/feat_prod`.
- `[x]` **Increment 03 — Database foundation**
  - Evidence:
    [`increments/03-database-foundation.md`](./increments/03-database-foundation.md)
  - Completion commit: `281e9fb`
  - `[x]` Establish the API-owned PostgreSQL Prisma boundary without changing the
    prototype SQLite schema.
  - `[x]` Add constrained identity-reference, organization, membership,
    role-assignment, audit-event, idempotency, outbox, and inbox foundations.
  - `[x]` Add explicit migration SQL, synthetic-only seed data, and production-safe
    seed guards.
  - `[x]` Add clean-install and representative upgrade migration verification.
  - `[x]` Add a constrained API infrastructure boundary for future capability-owned
    repositories; no generic CRUD repository was introduced.
  - `[x]` Review first lookup/list indexes using representative PostgreSQL query
    plans and record the evidence.
  - `[x]` Rehearse rollback/repair, run all quality gates, and publish the Section 20
    completion report.
  - `[x]` Commit and push the completed increment to `origin/feat_prod`.
- `[x]` **Increment 04A — Vendor-neutral identity and secure BFF session foundation**
  - Evidence:
    [`increments/04a-vendor-neutral-identity-and-secure-sessions.md`](./increments/04a-vendor-neutral-identity-and-secure-sessions.md)
  - Implementation commit: `e978076`
  - `[x]` Record the provider-neutral architecture and the deferred qualification gate.
  - `[x]` Separate internal principals from external `(issuer, subject)` identities.
  - `[x]` Implement Authorization Code + PKCE behind a provider-neutral adapter.
  - `[x]` Implement encrypted server-managed BFF sessions, CSRF/origin protection,
    refresh, logout, revocation, current-user, and step-up contracts.
  - `[x]` Enforce application-owned roles/memberships and authentication assurance.
  - `[x]` Remove plaintext/default credentials, browser identity authority, and
    `x-rp-session` authorization from the active path.
  - `[x]` Pass conformance, security, migration, and repository quality gates; publish
    the Section 20 completion report; commit and push.
- `[!]` **Increment 04B — Production identity-provider qualification**
  - Intentionally deferred by the product owner on 2026-09-28 so synthetic-data
    implementation can continue without vendor lock-in.
  - This is a mandatory gate before protected staging accepts non-synthetic users,
    before any real-user identity migration, and before Increment 12 begins.
  - Still requires provider, tenant region, privacy/legal terms, MFA/recovery,
    infrastructure cost, operational ownership, and exit-plan approval.
- `[x]` **Increment 05 — Policy engine and audit boundary**
  - Evidence:
    [`increments/05-policy-engine-and-audit-boundary.md`](./increments/05-policy-engine-and-audit-boundary.md)
  - Implementation commit: `a2fbd29`
  - `[x]` Define strongly typed named RBAC/ABAC policies with default deny.
  - `[x]` Implement the Section 22 role, ownership, membership, consent, assignment,
    redaction, and manager-privacy rules in a provider-neutral policy engine.
  - `[x]` Append every protected decision to the immutable audit store and fail closed
    when that audit fact cannot be persisted.
  - `[x]` Route administrative principal-session revocation through the named policy and
    mark the controller operation for architectural inventory checks.
  - `[x]` Disable unmigrated prototype Next.js APIs in staging and production while
    retaining them only for local/test prototype review.
  - `[x]` Add exhaustive table-driven role-policy, object-ownership, membership,
    consent, redaction, audit, and protected-route tests.
  - `[x]` Complete full repository, migration, security, and remote CI validation;
    publish the completion report; commit and push.
- `[x]` **Increment 06 — Public discovery vertical slice**
  - Evidence:
    [`increments/06-public-organization-discovery-checkpoint.md`](./increments/06-public-organization-discovery-checkpoint.md)
  - Implementation commit: `6a6fdfe`
  - `[x]` Add normalized organization public profiles, facility locations, service
    taxonomy, organization offerings, and facility-specific availability with
    database constraints and discovery indexes.
  - `[x]` Add public-safe hospital, pharmacy, laboratory, and service contracts plus a
    bounded, stable cursor API that excludes unverified, unpublished, suspended, and
    private data.
  - `[x]` Add narrowly allowlisted BFF routes and connect the patient hospital,
    pharmacy, and laboratory finders to server-side search, service/location filters,
    accessible retry states, and pagination.
  - `[x]` Complete PostgreSQL migration, repeatable synthetic seed, zero-drift,
    clean-upgrade/repair, bounded-query, query-plan, API/web test, and production-build
    evidence for organization discovery.
  - `[x]` Model practitioners as independent aggregates with optional, non-authoritative
    facility affiliations, governed profession/specialty catalogues, public credentials,
    global locations, languages, and consultation modes.
  - `[x]` Add public-safe practitioner discovery and catalogue APIs with bounded filters,
    stable cursors, single-query projections, privacy tests, and representative index
    plan evidence.
  - `[x]` Introduce the generated OpenAPI client with deterministic drift verification;
    adopt it in the frontend service boundary and connect the patient practitioner finder.
  - `[x]` Publish the completion report and pass the complete repository, migration,
    discovery, query-plan, generated-client, build, and dependency-audit gates.
- `[x]` **Increment 07 — Onboarding and administrative verification**
  - Evidence:
    [`increments/07-onboarding-and-administrative-verification.md`](./increments/07-onboarding-and-administrative-verification.md)
  - Implementation commits: `13915dc`, `40090f4`
  - `[x]` Add normalized patient, organization, and independent-practitioner application
    aggregates with a constraint-backed seven-state lifecycle and append-only history.
  - `[x]` Enforce applicant ownership, support review-only access, administrator-only
    decisions, manager exclusion, and facility-independent practitioner approval.
  - `[x]` Connect applicant, support, administrator, and governed clinical-catalogue
    interfaces through exact CSRF-protected BFF routes and generated API contracts.
  - `[x]` Pass clean/upgrade/repair migration, constraint, drift, repeatable seed,
    bounded-query, representative index-plan, repository, audit, and secret-scan gates.
- `[x]` **Increment 08 — Manager attribution, earnings, and restricted support**
  - Evidence:
    [`increments/08-manager-attribution-earnings-and-restricted-support.md`](./increments/08-manager-attribution-earnings-and-restricted-support.md)
  - Implementation commit: `286f6d2`
  - `[x]` Add purpose-scoped signed referral links and atomic applicant-controlled
    patient/organization attribution without manager access to private applications.
  - `[x]` Preserve immutable attribution history and governed effective-dated commission
    policy with optimistic concurrency and privileged step-up checks.
  - `[x]` Add private settled-activity ingestion and manager-only commission projections
    using integer minor units, per-currency totals, and explicit time zones.
  - `[x]` Add restricted manager support tickets with manager-visible and internal notes,
    controlled transitions, and minimal identifying information.
  - `[x]` Connect exact generated contracts, BFF routes, manager/support/admin interfaces,
    and fail closed the replaced prototype routes in protected environments.
  - `[x]` Pass repository, migration, drift, seed, query-plan, audit, secret-scan, build,
    and exact-head remote CI gates; publish the Section 20 completion report.
- `[~]` **Increment 09 — Appointment and payment vertical slice**
  - Active checklist:
    [`increments/09-appointment-and-payment-vertical-slice.md`](./increments/09-appointment-and-payment-vertical-slice.md)
- `[ ]` **Increment 10 — Files, notifications, and worker reliability**
- `[ ]` **Increment 11 — Remaining operational and clinical slices**
- `[ ]` **Increment 12 — Qualification and controlled launch**

## Material decisions intentionally still open

These are not implementation-agent choices. Stop before the affected production work:

- Production hosting region(s), every applicable jurisdiction/data-residency and
  cross-border assessment, and final account/environment ownership. Nigeria is one
  market profile, not an application-wide default.
- Production OIDC provider, tenant region, commercial terms, and privileged-user
  MFA/recovery policy (Increment 04B). The application identity boundary itself is
  vendor-neutral under ADR 0002.
- Managed durable queue and production observability providers.
- Paystack versus Flutterwave, commercial terms, settlement model, refund/dispute
  operations, and commission eligibility policy.
- Email/SMS providers and approved sensitive-content policy.
- Clinical terminology, retention/legal-hold policy, emergency access, and qualified
  clinical/privacy approvals.
- Production migration/cutover involving any real user, clinical, or financial data.

## Current implementation note

Increment 02 deliberately uses MinIO only for synthetic local development. Production
object storage remains private Amazon S3 under ADR 0001. The upstream MinIO repository
is archived, so its pinned local source build is a flagged non-standard dependency and
must be reassessed before Increment 10. Docker Desktop is not currently running on the
implementation host; Compose can be statically validated, while live dependency-stack
evidence must be recorded when a Docker engine is available.

Increment 03 was exercised against a disposable native PostgreSQL 18 instance because
Docker Desktop remained unavailable. CI now repeats migration and query-plan checks
against the pinned PostgreSQL 17.6 image. The prototype SQLite database remains
quarantined inside `apps/web`; its destructive `db:push --accept-data-loss` script was
removed and it is not a production data path.

Increment 04 is deliberately split. Increment 04A establishes and tests the complete
vendor-neutral trust boundary with synthetic identities. Increment 04B qualifies the
selected managed provider and remains visibly blocked on material human decisions.
The block does not prevent Increments 05–11 from using synthetic data after 04A, but it
does prevent real-user staging, identity migration, Increment 12, and public launch.

Increment 04A completed in `e978076`. The local synthetic OIDC provider and local-HTTP
cookie mode are test/development facilities only. Physical cleanup scheduling for
expired identity records is explicitly carried into the durable worker/retention work;
expired records are already rejected and indexed for cleanup. Increment 04B remains
separately blocked and mandatory.

Increment 05 completed in `a2fbd29`. Named policies now default deny and append every
protected decision to the immutable audit store. All unmigrated prototype APIs fail
closed in staging and production.

Increment 06 completed in `6a6fdfe`. Organization and practitioner discovery now use
durable PostgreSQL models, bounded public projections, stable cursor pagination,
representative query-plan gates, exact BFF allowlisting, and a generated OpenAPI client.
The practitioner profession/specialty seed is a broad canonical starting catalogue with
source metadata, not a substitute for qualified clinical governance; administrators can
extend and deactivate its records through the audited workflow delivered in Increment 07.
ADR 0003 now makes global deployability a standing invariant. Country-specific values
in prototype screens, legacy SQLite models, tests, or synthetic fixtures are not
production defaults and must be removed or routed through governed localization data as
each vertical slice migrates. New production work must not introduce an implicit
country, currency, locale, language, time zone, regulator, or regional provider.
Increment 07 completed in `13915dc` and `40090f4`. Its production onboarding and
administrative-verification path uses normalized application aggregates, append-only
history, administrator-only decisions, support review-only access, manager exclusion,
bounded keyset queues, exact BFF allowlisting, and generated contracts. Real document
upload/release remains fail-closed until Increment 10; qualified clinical catalogue
governance remains mandatory before real-data launch. Increment 08 completed in
`286f6d2`. It provides signed referral attribution, append-only corrections, governed
commission policy, privacy-safe earnings, and restricted support without manager access to
patient, payment, application, or organization private data. No live commission policy,
payment provider, payout workflow, banking data, or country/currency default was activated.
Increment 09 is the next implementation step; its vendor and financial-product choices remain
material approval gates before live integration.
The deferred Increment 04B identity-provider decision remains a mandatory gate before
protected staging with non-synthetic users, real-user migration, Increment 12, or launch;
it does not block synthetic implementation and validation of Increments 06–11.
