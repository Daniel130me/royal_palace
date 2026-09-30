# Increment 06 completion — public discovery vertical slice

## Status

Increment 06 is **complete**. The implementation commit is `6a6fdfe`. This report covers
organization discovery, independent practitioner discovery, governed public catalogues,
the generated API client, frontend adoption, and the evidence required by Section 20 of
the controlling plan.

## Implemented architecture

The production PostgreSQL model separates an organization's legal record from its public
profile, facility locations, governed service taxonomy, organization-level offerings,
and facility-specific availability. Composite foreign keys prevent a facility from
advertising another organization's offering. Database checks enforce publication and
verification timestamps, normalized slugs/codes, coordinate pairs and ranges, version
values, and nonblank location data. A partial unique index permits one primary facility
per organization. The global address model supports optional locality,
administrative-area, postal-code, address-line, country-code, and coordinate facts.
PostgreSQL `pg_trgm` GIN indexes back case-insensitive discovery search while ordered
B-tree indexes support stable catalogue pagination.

Practitioners are a separate aggregate from organizations. A practitioner may practise
independently, select an onboarded facility, or provide a typed facility name. An
affiliation is descriptive and never grants a hospital authority over verification,
fees, credentials, visibility, or the practitioner record. Publication requires an
active practitioner, administrator-controlled verification, and a published public
profile; it does not require an affiliation. Normalized models hold public professions,
specialties, locations, consultation modes, BCP-47 language tags, affiliations, and
deliberately public credentials. Database checks, foreign keys, partial uniqueness, and
discovery indexes protect these invariants below the application layer.

The initial catalogue contains 19 health professions and 124 specialties. Each record is
independently active/deactivatable and carries source-system, source-version, source-code,
and source-URI provenance. It is a broad global discovery starting point, not a claim
that one regulator's clinical classification governs every market. Audited administrator
catalogue maintenance belongs to Increment 07.

The API is a capability-owned Nest module with domain ports, application services,
Prisma adapters, and presentation validation. It exposes bounded hospital, pharmacy,
laboratory, practitioner, profession, specialty, detail, and type-scoped service
endpoints. All list queries use stable `displayName + id` keyset ordering; cursors are
canonical, versioned, filter/type-bound, and validate database identifiers before use.
Repository projections do not select legal names, registration numbers, identity
principals, verification internals, audit facts, memberships, or other private records.
Only active, verified, explicitly published records are discoverable.

The Next.js BFF exposes only explicit public discovery routes in protected environments;
the dynamic allowlist accepts UUID-shaped detail routes rather than broad prefixes. The
patient hospital, pharmacy, laboratory, and practitioner screens use server-side search
and filtering, request cancellation, bounded cursor pagination, and accessible loading,
empty, retry, invalid-filter, and server-failure states. Prototype bulk reads and
browser-side filtering are no longer used by these screens.

An OpenAPI 3.1 description is the source for a dedicated generated client package.
Generation is pinned, deterministic, and checked for drift during type checking. The
frontend service boundary uses generated paths and response types for organization,
service, profession, specialty, and practitioner requests; no handwritten duplicate API
shape remains on this discovery path. Ratings and fees are intentionally absent: ratings
require a completed-service integrity boundary and fees/currencies belong to the
appointment/payment slice, so this increment does not fabricate either.

## Public routes

- `GET /v1/public/hospitals` and `GET /v1/public/hospitals/:hospitalId`
- `GET /v1/public/pharmacies` and `GET /v1/public/pharmacies/:organizationId`
- `GET /v1/public/laboratories` and `GET /v1/public/laboratories/:organizationId`
- `GET /v1/public/services`
- `GET /v1/public/professions`
- `GET /v1/public/specialties`
- `GET /v1/public/practitioners` and
  `GET /v1/public/practitioners/:practitionerId`

The practitioner list supports bounded country, location, profession, specialty,
language, consultation-mode, and text filters. Organization lists retain bounded service
and location filters. Invalid filters and cursors fail explicitly rather than widening
the query silently.

## Validation evidence

- Clean install, prior-schema upgrade, transactional repair, and database constraints
  passed on disposable PostgreSQL 18 databases; CI repeats this on PostgreSQL 17.6.
- Synthetic seed executed twice without duplication. Schema drift was zero. Fixtures
  span Canada, Switzerland, and Singapore and contain no real identity or clinical data.
- Real-repository verification covered service and location filtering for hospitals,
  pharmacies, laboratories, and practitioners; stable pagination; private-field
  exclusion; and one-query organization and practitioner list projections through
  Prisma relation joins. Query count is independent of page size, preventing N+1 reads.
- Representative organization plans used the ordered discovery, service-join, and
  trigram indexes. Practitioner plan evidence used the natural ordered discovery and
  specialty-join indexes at a 12,000-practitioner fixture size. Location trigram
  eligibility was verified separately. Forced eligibility evidence is labelled as such
  and is not presented as a natural small-fixture plan or a production latency promise.
- API tests: 137 passed. Web tests: 32 passed. The generated-client test, worker tests,
  shared-package tests, zero-warning lint, strict type checks, all eight production
  package builds, 56 Next.js routes, standalone packaging, both Prisma schema
  validations, deterministic client-generation check, and high-severity dependency
  audit passed. The audit reported no known vulnerabilities.

## Boundaries carried forward

Increment 07 must provide audited administrator workflows for practitioner verification
and catalogue maintenance. It must preserve the rule that an administrator may verify a
practitioner regardless of facility affiliation and that no facility can approve,
reject, edit, price, or otherwise control a practitioner.

The platform still needs qualified clinical governance before the catalogue or public
credential policy is promoted to real-data production. Appointment availability,
service-completion-bound ratings, pricing, currency, and payment state remain in their
controlling later increments. No implicit country, currency, locale, regulator, cloud,
or payment-provider default was added here.

## Standards review

The implementation is capability-scoped, readable, normalized, constraint-backed,
query-bounded, public-projection-only, exact-route allowlisted, and reusable without a
generic CRUD abstraction. Shared cursor handling removes duplication while separate
organization and practitioner ports preserve aggregate boundaries. The generated client
removes contract drift without leaking transport code into UI components.

Security is fail-closed: only verified, active, explicitly published records are
returned; controllers validate inputs; cursors are filter-bound; public repositories
select only approved fields; and BFF production access is exact-route allowlisted.
Performance is protected by bounded limits, composite/trigram indexes, stable keyset
pagination, single-query relation projections, query-count assertions, and representative
plan gates. No N+1 query, unbounded list, browser-side bulk filtering, unpublished-data
fallback, hard-coded production credential, magic market value, or silent plan deviation
was introduced.

The one consciously deferred standard is qualified clinical governance of the seeded
catalogue and public credential policy. It is explicitly gated before real-data
production and is not hidden as completed product approval. Engineering validation does
not replace clinical, privacy, or legal review.
