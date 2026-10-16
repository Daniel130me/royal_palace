# Increment 11G — Settlements, payout execution, and finance reporting

Status: implemented; disposable migration rehearsal pending local PostgreSQL availability

This increment is the authoritative checklist for the three implementation slices delivered
as one reviewed batch. It preserves the signed prototype while replacing synthetic finance
assumptions with auditable production boundaries.

## 11G1 — Immutable settlement statements

- [x] Persist finalized, currency-specific settlement statements separately from earnings and
      payout requests.
- [x] Snapshot the exact earning facts included in each statement and prevent an earning from
      appearing in multiple statements.
- [x] Require finance/admin authorization, recent privileged authentication, an idempotency key,
      a bounded date range, and optimistic/serializable database behavior.
- [x] Allow organization members to read only their own statements; allow finance/admin users to
      read the platform statement register.
- [x] Emit audit events and expose an OpenAPI-generated client contract.

## 11G2 — Vendor-neutral payout execution

- [x] Add a provider-neutral payout gateway port and a deterministic synthetic adapter for local
      review only.
- [x] Keep payout execution disabled in staging and production until a real provider and operating
      region are qualified.
- [x] Enforce separation of duties: the requester, reviewer, and executor must be different people.
- [x] Use optimistic state transitions and a stable provider idempotency reference; record provider
      codes/references without exposing credentials.
- [x] Emit audit events for execution outcomes and surface failures or ambiguous outcomes for reconciliation.

## 11G3 — Bounded advanced finance reporting

- [x] Produce database-aggregated daily, monthly, or total finance summaries without loading
      individual transactions into application memory.
- [x] Keep every amount separated by ISO 4217 currency; never add unlike currencies.
- [x] Include earning, hold, payout, failure, and reconciliation indicators without clinical or
      patient details.
- [x] Connect the approved admin Reports screen to the production finance endpoint while preserving
      the remaining signed-prototype report sections for their later domain migrations.
- [x] Validate contracts, policy coverage, schemas, unit/integration tests, lint, typecheck, and
      production builds.
- [ ] Rehearse the new migration against disposable PostgreSQL. Docker Desktop/PostgreSQL was not
      available on 2026-10-17; this gate must be run before the migration is applied outside a disposable
      environment.

## Browser review

- Administrator settlement statements and payout governance: `#/admin/settlements`
- Administrator advanced finance summary: `#/admin/reports`
- Laboratory organization settlement reporting: `#/laboratory/settlements`
- Laboratory organization payout requests: `#/laboratory/payouts`

## Validation evidence

- Prisma API and prototype-web schemas validate.
- Workspace formatting, lint, all eight package typechecks, and all eight production builds pass.
- Workspace tests pass: API 978 passed/1 skipped; web 44 passed; worker 20 passed/12 skipped;
  config 23 passed; security 10 passed; API client 1 passed; prototype-manifest tests 4 passed.
- The live prototype-parity verifier confirms all 139 approved capabilities across 11 portals,
  all 16 visual references, and all 138 historical prototype artifacts.
- Report reads are bounded to 366 days and aggregate in PostgreSQL by period and currency. Statement
  and payout lists are capped at 100 records. No unbounded earning/transaction collection is loaded
  into the reporting UI.
- Security review confirms default-deny named policies, recent privileged authentication,
  idempotent settlement finalization, optimistic payout transitions, requester/reviewer/executor
  separation in policy, application, and database constraints, and fail-closed protected runtime
  configuration.
- Non-standard/open item: disposable migration replay is not claimed as passed while local
  PostgreSQL test credentials or Docker PostgreSQL are unavailable. The migration is not to be
  applied to shared or production data until that rehearsal passes.

## Deliberate boundaries

- No pharmacy, practitioner, logistics, hospital, manager, tax, or platform-revenue percentage is
  invented here. Each begins only after its commercial rule has been approved and stored as an
  immutable transaction-time snapshot.
- No live transfer can be initiated by this increment. `disabled` is the only permitted payout
  gateway mode in protected environments.
- Payment, ledger entry, organization earning, settlement statement, payout request, and provider
  execution remain separate concepts and state machines.
