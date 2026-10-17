# Increment 11I — Public information and pricing parity

## Scope completed

This batch completes the next three signed-prototype public capabilities:

1. **11I1 — Help and support.** The approved contact cards and FAQ surface remain present,
   but fictional Nigeria-only contacts and the unverified 24/7 claim are removed. Email,
   E.164 phone, and availability text now come from validated deployment configuration.
   Protected environments fail startup unless at least one qualified public support contact is
   configured.
2. **11I2 — How It Works.** The approved six-step journey remains present and now describes
   the implemented authorization, governed pricing, clinical, laboratory, prescription,
   pharmacy, and qualified-delivery boundaries. Demo-persona and simulated-flow language is
   removed.
3. **11I3 — Pricing.** The page no longer reads the legacy generic resource API or assumes
   NGN. A generated public contract returns only currently effective administrator-approved
   patient prices through a bounded cursor endpoint. The existing Services page was also
   corrected to remove fabricated hard-coded prices.

## Architecture and data boundaries

- Public pricing is a read projection in the discovery domain over the governed service-price
  aggregate. Price creation and approval remain inside the existing administrator boundary.
- One database query returns at most 50 rows and selects only currency, effective period,
  patient amount, and public service identity. Provider payout, approval/creation actors,
  status history, and internal price identifiers are not mapped into the response.
- The API emits a filter-bound opaque cursor. The browser uses the generated OpenAPI client
  through an exact same-origin BFF route and never calculates or supplies an authoritative
  amount.
- Support contacts are public deployment configuration, not source constants or database
  secrets. Local/test may omit them; staging and production must configure at least one
  qualified channel.

## Performance and database review

- Public pricing is capped at 25 rows per browser request and 50 rows at the API boundary.
- The read uses one Prisma query with stable service-name/identifier ordering and no N+1
  relations.
- `service_prices_public_effective_idx` supports active/effective filtering. The disposable
  database verification asserts the one-query ceiling and current-price projection.
- Browser requests support cancellation for initial loads and cursor-based continuation for
  larger catalogues.

## Security and globalization review

- Draft, retired, future, and expired prices cannot enter the public projection.
- Provider payouts, internal actors, and audit data are not selected, serialized, or included
  in the public contract.
- Amounts remain integer minor-unit strings with ISO 4217 currency codes and are formatted by
  the runtime locale. No market, country, currency, or gateway is hard-coded.
- Support configuration validation rejects malformed email and phone values; no unmonitored
  fallback contact is invented when configuration is unavailable.

## Prototype screens and browser review

- Help: `http://127.0.0.1:3100/#/public/help`
- How It Works: `http://127.0.0.1:3100/#/public/how-it-works`
- Pricing: `http://127.0.0.1:3100/#/public/pricing`
- Supporting Services correction: `http://127.0.0.1:3100/#/public/services`

The signed visual structure remains available. `CONNECTED` records production integration;
stakeholder visual comparison and final `ACCEPTED` status remain controlled UAT work.

## Validation evidence

- `corepack pnpm verify` passed: prototype parity, formatting, all eight-package lint and
  type-check tasks, generated-client drift, tests, production builds, and both Prisma schema
  validations.
- Automated tests passed: API `981` (`1` skipped), web `48`, worker `20` (`12` integration
  tests skipped), configuration `24`, security `10`, API client `1`, and prototype parity `4`.
- The disposable PostgreSQL migration suite passed clean-install, upgrade, repair, payment
  backfill, migration immutability, and transactional-policy checks across all 50 migrations.
- The seeded public-discovery verification passed the public-price privacy assertions and the
  one-query ceiling.
- Prototype parity remains complete at `139` signed capabilities: `66 CONNECTED`, `3
  CORRECTIVE`, `20 IN_PROGRESS`, `49 PENDING`, and `1 REVIEW_REQUIRED`.

## Maintainability review

- **Readable and structured:** page content, deployment configuration, public contracts, and
  database projection have separate named responsibilities.
- **Easy to extend:** additional currencies, categories, markets, and support channels extend
  configuration or governed catalogue data rather than page constants.
- **Security first:** the repository allowlists every public price field and protected
  environments fail closed on absent support ownership.
- **Performance conscious:** bounded single-query reads, a targeted index, opaque cursor
  pagination, and request cancellation prevent unbounded catalogue loading.
- **No magic values:** page and API limits are named; monetary values and contact details are
  governed data or validated configuration.
- **No over-engineering:** the implementation reuses the public-discovery BFF/client and the
  existing governed service-price aggregate; it introduces no duplicate pricing store.
- **Non-standard implementation flagged:** the already-published finance migration
  `20261017000000_finance_settlements_and_payout_execution` predates this batch and is not
  transaction-wrapped. Rewriting published migration history would be unsafe, so its exact
  checksum is pinned by the migration verifier as an immutable legacy exception. This batch's
  new migration is transactional. The broader public-site wrapper remains `IN_PROGRESS` until
  cross-page visual UAT is completed, and real support contacts remain an Increment 12
  operational qualification responsibility.
