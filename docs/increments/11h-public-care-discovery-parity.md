# Increment 11H — Public care discovery parity

## Scope completed

This batch completes three client-approved public-care implementations without restoring
the prototype's generic resource API:

1. **11H1 — Public home.** Featured practitioners come from the bounded public discovery
   contract. The page retains care entry points and adds the approved hospital path while
   removing invented platform metrics, example prices, Nigeria-only copy, and demo claims.
2. **11H2 — Practitioner directory.** Public visitors and authenticated patients use one
   shared, generated-contract-backed directory with controlled profession/specialty values,
   bounded server-side filtering, cursor pagination, request cancellation, and public-safe
   projections.
3. **11H3 — Practitioner profile and booking entry.** The public profile contains only the
   independently verified public projection. The appointment panel reads real published
   availability for a bounded 30-day horizon and displays each slot's immutable amount and
   ISO currency. No browser-created slot or price is presented as authoritative.

## Architecture and contract impact

- No database migration or API contract change was required. Increment 06 discovery and
  Increment 09 scheduling already own the necessary production boundaries.
- A shared practitioner-directory component prevents public and patient discovery behavior
  from drifting while leaving authentication and booking authorization at the existing BFF
  and API boundaries.
- Public pages continue to use the generated OpenAPI clients through the same-origin BFF.
  They do not call generic resource routes or decide whether a practitioner is verified.
- Availability remains read-only and bounded publicly. Booking still requires a patient
  session, CSRF protection, idempotency, and the existing server transaction.

## Query and performance review

- Directory requests are capped at 20 items and use opaque cursor pagination.
- Filters execute in the discovery repository against its existing indexed public projection;
  the browser no longer downloads the full practitioner table to filter locally.
- The home page requests at most four practitioner summaries.
- The profile issues two independent bounded reads in parallel: one practitioner projection
  and at most the scheduling service's configured availability limit within 30 days.
- Abort signals cancel obsolete browser requests when filters or routes change.

## Security and privacy review

- Verification, publication, field minimization, and filter validation remain server-owned.
- Public screens do not expose registration numbers, licence identifiers, patient information,
  organization-private data, or unpublished provider records.
- Currency and geography are record data; no country, locale, or currency is treated as a
  global application default.
- Public navigation cannot grant a patient role. Booking redirects unauthenticated visitors
  into the OIDC login flow and reuses the existing session-derived authorization boundary.

## Prototype screens and browser review

- Public home: `http://127.0.0.1:3100/#/public/home`
- Public practitioner directory: `http://127.0.0.1:3100/#/public/providers`
- Public practitioner profile: open any result from the directory; the route is
  `http://127.0.0.1:3100/#/public/provider?id=<practitioner-id>`.
- Patient practitioner directory (shared production implementation):
  `http://127.0.0.1:3100/#/patient/doctors` after signing in as a patient.

The signed prototype layout and outcomes remain present. Stakeholder visual comparison and
formal `ACCEPTED` parity status remain part of controlled UAT; this implementation records
the capabilities as production-connected, not stakeholder-accepted.

## Validation evidence

- `corepack pnpm verify`: passed across all eight workspace packages.
- Prototype parity: passed for 139 approved capabilities, 11 portals, 16 visual artifacts,
  and 138 historical artifacts; verifier unit tests passed (4/4).
- Formatting, lint, and TypeScript: passed across the full workspace.
- Tests: API 978 passed/1 skipped; web 47 passed; worker 20 passed/12 skipped; config 23
  passed; security 10 passed; API client 1 passed; contract/testing packages had no test
  files by design.
- Production build: passed for all eight packages; Next.js generated all 57 static pages and
  packaged the standalone server.
- Database validation: both API and web Prisma schemas are valid.

No production provider or real user data is enabled by this increment.

## Maintainability review

- **Readable and structured:** shared discovery behavior has one named component and small
  pure query/range helpers; public pages remain presentation-focused.
- **Easy to extend:** new controlled filters extend the shared query builder and generated
  contract rather than duplicating page-specific filtering.
- **Security first:** public projections and server-derived verification replace generic CRUD
  and browser-trusted filtering.
- **Performance conscious:** bounded API reads, cursor pagination, parallel profile requests,
  and cancellation prevent full-table and stale-request behavior.
- **No magic values:** page size, debounce interval, profile slot count, and availability
  horizon are named constants. Region, country, currency, and provider are not hard-coded.
- **No over-engineering:** the batch reuses the established discovery/scheduling modules and
  introduces no new persistence or provider abstraction.
- **Non-standard implementation flagged:** the remaining public Help, How It Works, Pricing,
  and overall public-site parity items are still tracked as pending; stakeholder visual UAT is
  also still open.
