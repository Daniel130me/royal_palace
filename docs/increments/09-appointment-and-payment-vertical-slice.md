# Increment 09 — appointment and payment vertical slice

## Status

**Complete.** The production implementation, local acceptance evidence, implementation
commit, and exact-head remote CI run are complete.

## Architecture checklist

- [x] Add explicit scheduling, pricing, appointment, payment, webhook, ledger, and
      reconciliation aggregates under a dedicated production capability boundary.
- [x] Model provider availability as bounded bookable slots and prevent overlapping
      availability and double booking with database-enforced invariants.
- [x] Keep appointment price snapshots immutable and source them from administrator-governed,
      effective-dated practitioner fees using integer minor units and ISO 4217 currency.
- [x] Add a provider-neutral hosted-checkout port. Permit only a synthetic adapter in local
      development/test and fail closed in staging/production until a provider is approved.
- [x] Persist authenticated webhook metadata and hashes before processing; deduplicate by
      provider event ID and provider payment reference through inbox boundaries.
- [x] Implement explicit, monotonic appointment and payment state machines, including
      timeout, abandonment, failure, duplicate, reversal, refund, and dispute handling.
- [x] Add an immutable balanced double-entry ledger. Do not classify clearing balances as
      revenue or encode an unapproved custody/settlement model.
- [x] Emit one durable outbox event for eligible settled patient activity so the existing
      idempotent manager-earning boundary cannot double-post commission.
- [x] Add controlled reconciliation that compares provider-authoritative state with internal
      state; privileged users may request reconciliation but may not invent provider outcomes.

## API and frontend checklist

- [x] Add patient availability, appointment booking/detail, checkout-session, and payment
      status endpoints with exact ownership policies and idempotent mutation contracts.
- [x] Add provider availability management and administrator fee-management endpoints with
      organization/practitioner scope checks and fresh assurance for fee changes.
- [x] Add unauthenticated provider webhook endpoints that authenticate the raw body before
      parsing or persisting any event.
- [x] Describe the API in OpenAPI, generate the client deterministically, and reject drift.
- [x] Connect the patient booking/payment experience to production BFF routes and status
      polling without trusting checkout redirect query parameters.
- [x] Retire or fail closed the replaced prototype booking and payment routes in protected
      environments.

## Evidence checklist

- [x] Migration clean-install, prior-schema upgrade, repair, constraints, repeatable seed,
      zero-drift, and rollback/recovery evidence pass.
- [x] Concurrent booking tests prove a slot can produce at most one active appointment.
- [x] Webhook tests cover invalid signatures, altered payloads, duplicates, reordering,
      unknown references, failures, expiry, reversal, refund, and dispute events.
- [x] Ledger tests prove every transaction balances per currency and immutable entries cannot
      be updated or deleted.
- [x] Reconciliation tests report mismatches and apply only provider-authoritative outcomes.
- [x] Lists and status reads are bounded, use narrow projections, avoid N+1 reads, and
      representative PostgreSQL plans use intended indexes.
- [x] Repository format, lint, strict type-check, tests, production build, Prisma validation,
      dependency audit, and secret scan gates pass.
- [x] Section 20 completion evidence and the maintainability/security/performance walkthrough
      are recorded.
- [x] Conventional commits are pushed to `origin/feat_prod` and exact-head remote CI succeeds.

## Explicit material-decision boundary

This increment must not choose or activate Paystack, Flutterwave, or another live provider;
set commercial terms; define production custody, settlement, refund, dispute, tax, or payout
operations; activate a real commission policy; or process real financial data. Those are
material product, security, legal, infrastructure-cost, and production-data decisions. The
production adapter stays disabled until those decisions and provider due diligence are
approved. A deterministic synthetic adapter may be used only in local development and tests
to prove the provider-neutral contract and failure paths.

## Non-negotiable global and privacy boundaries

- No country, currency, locale, language, time zone, payment rail, or provider is implicit.
- Money is an integer minor-unit amount paired with an explicit ISO 4217 currency code.
- A patient sees only their appointments and payments; managers never receive gross payment
  values or payment references through this capability.
- Browser redirects are navigation only. They never authorize payment or appointment state.
- Webhook bodies, credentials, card data, clinical narrative, and unnecessary personal data
  are never written to application logs or audit metadata.
- Card PAN, CVV, bank credentials, or other payment credentials are never collected or stored.

## Section 20 completion report

**Increment:** 09 — appointment and payment vertical slice.

**Scope completed:** Added administrator-governed consultation fees; provider availability;
atomic appointment booking; patient-owned appointment/payment reads; hosted checkout sessions;
authenticated webhook ingestion; explicit payment transitions; reservation expiry; immutable
double-entry ledger records; provider-authoritative reconciliation; and exactly-once settled
patient-activity events for the existing manager-earning boundary. The generated API client,
signed BFF routes, and patient booking/payment interfaces use the production capability.

**Architecture and extensibility:** The capability is isolated under
`apps/api/src/scheduling` with domain ports and state rules, an application service, Prisma
infrastructure, and presentation controllers. Payment-provider behavior is behind a narrow
port. The deterministic synthetic adapter is local/test-only, while protected environments
fail closed with a disabled adapter. OpenAPI remains the API/client source of truth. The
Graphify architecture review was used to preserve the existing identity, authorization,
manager-privacy, generated-client, BFF, database, worker, and frontend boundaries rather than
introducing a parallel trust path.

**Database migration and recovery:** Migration
`20261001120000_appointment_payment_vertical_slice` adds effective-dated fees, availability,
appointments, payments, checkout attempts, authenticated webhook evidence, payment history,
ledger transactions/entries, and reconciliation records. Exclusion constraints prevent
overlapping active fees and provider slots; snapshot and immutability triggers protect booked
times, ownership, prices, payment identity, webhook evidence, history, ledger, and
reconciliation. Deferred constraints require each ledger transaction to balance by currency.
Deploy it from the controlled migration job before API/web release. Before real use, rollback
means restoring the verified backup with the previous application binaries; after financial
facts exist, pause writes and use point-in-time recovery or a reviewed forward repair rather
than deleting history. Clean install, prior-schema upgrade, transactional repair, constraint,
and concurrent-booking evidence passed against disposable PostgreSQL 18 databases.

**API and authorization impact:** Added public practitioner availability; provider slot
creation; administrator fee creation/activation and payment reconciliation; patient booking,
appointment detail, checkout, and payment status; authenticated provider webhooks; and a
worker-only reservation-expiry endpoint. Every protected operation crosses the signed BFF
session boundary and a named default-deny policy. Administrative financial mutations require
fresh privileged assurance. Patient ownership is enforced before returning appointment or
payment data, and manager roles receive no access through this capability.

**Security and privacy:** Webhooks authenticate the exact raw body with rotating key IDs and
constant-time signature comparison before parsing or persistence. Inbox/provider event keys
deduplicate repeats and races, hashes retain evidence without retaining sensitive payloads,
and unknown or mismatched references fail closed. Idempotency keys are included in the signed
internal-request canonical form. Card, bank, clinical, gross-payment, provider-reference, and
webhook-body data are not exposed through manager projections or application logs. Browser
redirects are navigation only; server-side provider evidence controls payment state.

**Financial and global boundaries:** Money is stored as integer minor units with an explicit
three-letter ISO 4217 currency, and the ledger balances separately per currency. No country,
currency, locale, language, time zone, payment rail, or provider is implicit. Clearing account
labels record movement without declaring unapproved revenue, custody, settlement, tax, or
payout treatment. No live payment provider or commission policy is activated. Provider
selection, commercial terms, custody/settlement/refund/dispute rules, tax treatment, payout
operations, and real financial data remain material decisions and block production payment
activation.

**Query and concurrency evidence:** Public availability and reservation-expiry reads are
bounded with narrow projections; patient payment status uses a primary-key lookup. At
representative scale, PostgreSQL naturally used `availability_slots_public_lookup_idx`,
`appointments_payment_timeout_idx`, and `payments_pkey`, while all earlier discovery,
onboarding, manager, audit, and outbox index assertions remained green. A two-connection race
proved that exactly one appointment/payment can claim a slot. Serializable webhook/expiry
transactions, database uniqueness, and idempotent ledger/outbox event keys cover duplicate
workers and provider delivery races without N+1 reads.

**Validation evidence:** `pnpm install --frozen-lockfile`, formatting, lint, strict type-check,
generated-client drift, all tests, production build, and Prisma validation passed across all
eight workspaces. The API suite passed 24 files/316 tests; web passed 5 files/33 tests; worker
and shared-package tests passed. The Next.js production build generated 64 pages and packaged
standalone output. Migration clean/upgrade/repair verification, representative query plans,
and the scheduling/payment persistence verifier passed, covering retries, authenticated event
persistence, duplicates, reordering, invalid references, refunds, ledger balance, outbox
idempotency, reconciliation, UTC timestamp round-trips, and expiry. Dependency audit reported
no known vulnerabilities after upgrading NestJS/Fastify to the patched releases. The local
credential-pattern scan and exact-head committed-history Gitleaks job passed.

**Maintainability/security/performance walkthrough:** Confirmed. The implementation uses
readable capability boundaries, explicit contracts, named policies, deterministic generated
clients, narrow database projections, bounded batches, integer money, database-enforced
invariants, and comments only where concurrency or financial ordering is non-obvious. Review
found and fixed timestamp skew caused by the PostgreSQL driver adapter's offset-free
`timestamptz` serialization by pinning every adapter session to UTC and proving round-trips in
the persistence verifier. It also fixed inbox lifecycle timestamps, webhook outcome modeling,
query-fixture selectivity, and a patched Fastify denial-of-service advisory instead of
accepting local-only workarounds. The non-standard adapter behavior is explicitly contained in
`PrismaService`; live-provider semantics and the deferred production identity-provider,
infrastructure, queue/observability, and real-data decisions remain flagged.

**Deployment order:** Take and verify a restorable backup; deploy the migration once; deploy
API/config with payment mode disabled; run readiness, migration, protected-contract, and UTC
round-trip smoke checks; deploy worker and web BFF/frontend; then monitor authorization
denials, idempotency conflicts, slot contention, webhook failures/duplicates, inbox backlog,
ledger/reconciliation mismatches, reservation expiry, latency, and error budgets. Do not
enable a live provider until its material decisions and due diligence are approved. Roll back
on privacy leakage, signature/auth regression, invariant/ledger/reconciliation failure,
schema drift, migration failure, or material latency/error-budget regression.

**Remote close:** Implementation commit `efcbf3f` was pushed to `origin/feat_prod`. GitHub
Actions run `36880191144` passed all three exact-head jobs: workspace verification and
dependency audit, PostgreSQL migrations/query plans/persistence verification, and
committed-history secret scanning. No approval gate is requested; Increment 10 is the next
approved implementation step, while the recorded live-payment decisions remain deferred.
