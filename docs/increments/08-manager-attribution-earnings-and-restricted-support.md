# Increment 08 — manager attribution, earnings, and restricted support

## Status

**Complete.** The production implementation, local acceptance evidence, implementation
commit, and exact remote CI run are complete.

## Architecture checklist

- [x] Add a production manager profile linked to an application-owned identity principal;
      do not recreate organization portfolio ownership or broad data access.
- [x] Add versioned, revocable, purpose-scoped referral links protected by authenticated
      cryptographic tokens and key rotation.
- [x] Attach patient/organization applications to referrals atomically while applicants
      submit their own confidential data.
- [x] Record attribution and administrative correction as append-only events; maintain a
      constrained current projection rather than rewriting attribution history.
- [x] Add versioned, effective-dated commission policies with explicit predicates and no
      hard-coded rate, activity, currency, country, or provider default.
- [x] Add a private settled-patient-activity boundary for Increment 09 integration and
      generate immutable earnings only when attribution and an active policy both qualify.
- [x] Keep gross payment amount, patient identity, organization private data, policy rate,
      and Royal Palace revenue out of every manager projection, filter, error, and log.
- [x] Add privacy-safe support tickets with minimal identity, controlled statuses, and
      append-only manager-authored follow-up.
- [x] Extend named RBAC/ABAC policies and immutable authorization audit coverage for manager,
      support, finance, administrator, and system-worker operations.

## API and frontend checklist

- [x] Add exact applicant referral-claim, manager self/referral/status/earnings/ticket,
      support ticket-review, and administrator manager/policy/correction endpoints.
- [x] Describe the API in OpenAPI, generate the client deterministically, and reject drift.
- [x] Preserve referral context through OIDC and connect patient/organization self-onboarding
      without allowing a manager to create or edit an application.
- [x] Connect the manager dashboard/onboarding/status/earnings/support views to production
      APIs and remove gross-payment, managed-organization, and full-application concepts.
- [x] Connect the necessary support and administrator controls to production APIs.
- [x] Retire or fail closed the corresponding prototype manager routes in protected
      environments.

## Evidence checklist

- [x] Migration clean-install, prior-schema upgrade, repair, append-only constraints,
      overlap/uniqueness constraints, repeatable seed, and zero-drift checks pass.
- [x] Authorization tests prove managers can access only their profile, links, minimal
      referral status, earnings, and own ticket follow-up.
- [x] Privacy tests prove manager responses contain no gross amount, patient/payment
      reference, policy rate, organization private fields, or hidden totals.
- [x] Attribution correction is append-only and audited; token tampering, expiry, revocation,
      wrong purpose, and duplicate attribution of the same application fail closed. Referral
      links themselves remain intentionally reusable by multiple applicants.
- [x] Earning creation is idempotent, uses integer minor units, reconciles across
      daily/monthly/custom ranges per currency, and rejects overlapping policy activation.
- [x] Lists and reports are bounded, use stable keysets, avoid N+1 reads, and representative
      PostgreSQL plans use intended indexes.
- [x] API, generated-client, BFF, and frontend tests pass.
- [x] Repository format, lint, strict type-check, test, production build, Prisma, dependency
      audit, and secret scan gates pass.
- [x] Section 20 completion evidence and the maintainability/security/performance walkthrough
      are recorded.
- [x] Conventional commits are pushed to `origin/feat_prod` and the exact remote CI run
      succeeds.

## Explicit financial boundary

No production commission policy is activated by default. The implementation may provide a
governed, versioned mechanism and synthetic test policy, but real rates, eligibility,
settlement timing, reversals, disputes, payout operations, tax treatment, and approvals
remain financial-product decisions. Increment 09 supplies verified payment-provider events;
until then, only synthetic/test settled-activity input may exercise earning generation.

## Non-negotiable privacy and global boundaries

- A manager distributes links; the applicant authenticates and submits their own data.
- Attribution never grants patient, application, payment, clinical, or organization access.
- Manager referral status is deliberately minimal and cannot contain reviewer notes.
- Earnings are reported as commission minor units grouped by ISO 4217 currency. Different
  currencies are never summed together.
- Daily/monthly/custom reporting uses explicit time boundaries and an IANA time zone; no
  locale, currency, country, regulator, or time zone is implicit.
- Ticket text is operational only. Managers cannot access internal notes, attachments,
  clinical facts, payments, or messages written for support/administrators.
- No bank account, payout credential, provider recipient code, or live payout workflow is
  introduced before the settlement/payout slice and its security review.

## Section 20 completion report

**Increment:** 08 — manager attribution, earnings, and restricted support.

**Scope completed:** Added the production manager identity/profile boundary; reusable,
purpose-scoped signed referral links; atomic patient/organization attribution; append-only
attribution correction; governed commission policies; private settled-activity ingestion;
privacy-safe manager earnings; restricted support tickets; exact manager/support/admin BFF
routes; and the connected manager, support, and administrator interfaces.

**Architecture and extensibility:** The capability is isolated under `apps/api/src/manager`
with explicit domain ports, application services, Prisma infrastructure, and presentation
controllers. Attribution history and earnings are immutable facts with constrained current
projections. Commission policy is effective-dated and versioned. No generic CRUD layer,
provider-specific payment model, organization portfolio ownership, or manager access to
patient/application/organization records was introduced. The Graphify architecture review
was used to preserve the existing authorization, onboarding, generated-client, and BFF
boundaries rather than creating parallel trust paths.

**Database migration and recovery:** Migration
`20260930203745_manager_attribution_earnings_support` adds manager profiles, referral links,
attribution events/current projection, commission policies, patient-activity settlements,
manager earnings, restricted tickets, follow-ups, constraints, append-only triggers, and
query indexes. Deploy it from the controlled migration job before the API and web release.
On pre-use failure, roll back both application binaries and restore the verified database
snapshot. After committed real-data writes, do not reverse or delete financial/attribution
history; pause writes and use point-in-time recovery or a reviewed forward repair migration.
Clean install, prior-schema upgrade, transactional repair, constraint proofs, drift checks,
and repeatable synthetic seed passed against disposable PostgreSQL 18 databases.

**API and authorization impact:** Added versioned manager self-service, referral status,
earnings, ticket, administrator program/policy/correction, and support ticket-review APIs.
OpenAPI 3.1 contracts generate the frontend client and drift is rejected. Every protected
operation resolves actor identity through the signed BFF session boundary and a named
default-deny policy. Policy activation and attribution correction require fresh privileged
assurance. Managers can see only their profile, issued links, minimal application status,
commission amounts, and manager-visible ticket follow-ups; support/admin authorization does
not expand the manager projection.

**Security and privacy:** Referral claims are HMAC authenticated with explicit key IDs and
token versions, constant-time verification, database-controlled validity/revocation, and
purpose matching. Signing keys are required startup configuration and support rotation.
Attribution corrections are append-only, optimistic-concurrency protected, and transactionally
rolled back on races. Manager responses exclude patient IDs, payment references, gross
amounts, policy rates, Royal Palace revenue, private organization data, review notes, and
internal support notes. Legacy manager portfolio, payment, payout, and direct-onboarding APIs
remain present only for prototype review and are denied by the staging/production proxy.

**Financial and global boundaries:** Money uses integer minor units and ISO 4217 currency
codes; currencies are reported separately and never summed together. Daily/monthly reports
use explicit instants and an IANA time zone. No country, currency, locale, time zone, rate,
payment vendor, bank, payout rail, tax rule, or provider default is hard-coded. No live policy
is seeded or activated. Rates, payment-provider settlement/reversal semantics, disputes,
payouts, tax, and real approvals remain material product decisions for Increment 09 and
later release qualification.

**Query and performance evidence:** All lists are bounded and keyset-paginated; repository
projections select only required fields and avoid N+1 access. PostgreSQL evidence used 10,000
manager attributions, 2,000 tickets, and 5,000 earnings. Referral and ticket cursor queries
naturally used `current_referral_attribution_manager_updated_idx` and
`manager_support_tickets_manager_updated_idx`; the earnings date-range workload proved
`manager_earnings_manager_occurred_idx`. Existing discovery/onboarding/audit/outbox plans
also remained indexed. The query-plan fixture was corrected to use collision-free synthetic
ticket numbers and representative earning rows instead of weakening its assertion.

**Validation evidence:** `pnpm format`, `pnpm lint`, and `pnpm typecheck` passed across all
eight workspaces. `pnpm test` passed with API 21 files/245 tests, web 5 files/33 tests, and all
worker/shared-package tests. `pnpm build` passed, including the Next.js production build,
61-route page generation, and standalone packaging. `pnpm db:validate`, migration verification,
deploy, drift check, two seed runs, public-discovery verification, and representative query
plans passed. `pnpm audit --audit-level high` reported no known vulnerabilities. A local
credential-pattern scan found no secrets; committed-history Gitleaks remains the remote CI
gate.

**Maintainability/security/performance walkthrough:** Confirmed. Code uses readable capability
boundaries, explicit types, deterministic generated contracts, centralized policy checks,
database-enforced invariants, comments only for non-obvious concurrency/money/identifier
logic, stable pagination, narrow projections, and representative index proofs. The review
fixed contradictory composed OpenAPI schemas, a UUIDv7-prefix ticket-number collision risk,
and concurrent attribution error handling rather than accepting temporary workarounds. No
unexplained magic business value or implicit regional assumption was added. The deliberately
deferred identity-provider qualification, live payment policy, payout workflow, production
queue/observability vendors, real-data migration, and legacy prototype removal are explicitly
flagged and still block their relevant production/release gates.

**Deployment order:** Take and verify a restorable backup; deploy the migration once; deploy
API/config with referral signing keys; run readiness and protected-contract smoke checks;
deploy the web BFF/frontend; then monitor authorization denials, invalid referral claims,
attribution/policy conflicts, ticket transitions, earning reconciliation, and latency before
enabling the feature. Roll back on privacy leakage, signature/auth regression, invariant or
reconciliation failure, schema drift, migration failure, or material latency/error-budget
regression.

**Remote close:** Implementation commit `286f6d2` was pushed to `origin/feat_prod`. GitHub
Actions run `36804345725` passed all three exact-head jobs: workspace verification and
dependency audit, PostgreSQL migrations/query plans, and committed-history secret scanning.
No approval gate is requested; Increment 09 is the next approved implementation step, subject
to the already-recorded material payment decisions before live-provider activation.
