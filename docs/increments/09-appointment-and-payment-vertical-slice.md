# Increment 09 — appointment and payment vertical slice

## Status

**Implementation complete; remote closure pending.** The production code and local acceptance
evidence are complete. The implementation commit, exact-head remote CI, and final Section 20
closeout remain before this increment is marked complete.

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
- [~] Repository format, lint, strict type-check, tests, production build, Prisma validation,
  dependency audit, and local credential-pattern scan pass; committed-history Gitleaks is
  pending on the implementation commit.
- [ ] Section 20 completion evidence and the maintainability/security/performance walkthrough
      are recorded.
- [ ] Conventional commits are pushed to `origin/feat_prod` and exact-head remote CI succeeds.

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

To be completed after implementation, validation, commit, push, and exact-head remote CI.
