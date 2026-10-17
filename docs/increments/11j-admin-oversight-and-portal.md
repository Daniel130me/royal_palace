# Increment 11J — Administrator oversight and portal

Status: implemented; qualification and stakeholder acceptance remain part of Increment 12.

## Scope completed

- **11J1 — Admin portal:** preserves every signed administrator navigation destination and carries
  authoritative platform roles into the browser session projection. Finance users who share the
  shell are limited to Payments, Settlements, and Reports; URL state cannot grant an admin screen.
- **11J2 — Appointments:** connects the signed overview to `GET /v1/admin/appointments` through an
  exact same-origin BFF route. Search and status/day filters execute on the server, pagination is
  bounded to 50, and the screen retains its summary tiles, filters, consultation channel, names,
  schedule, amount, currency, and status.
- **11J3 — Audit trail:** connects the signed audit screen to `GET /v1/admin/audit-events`. It keeps
  time, actor-role, action, and text filters, expandable event detail, and CSV export of the rows
  loaded by the reviewer.

## Architecture and security

The new `administration` API module is a read-only projection boundary. It does not take ownership
of scheduling writes or authorization audit writes, and it does not reuse the quarantined generic
resource API. Named policy version 29 grants both projections only to `ADMINISTRATOR`; every access
decision is itself appended to the immutable audit store before data is read.

Appointment projections select only identity labels, schedule, channel, status, and commercial
amount/currency. They do not select consultation notes, diagnoses, prescriptions, laboratory data,
contact details, or payment-provider data. Audit projections deliberately omit metadata, patient
scope, organization scope, request headers, correlation identifiers, and other contextual payloads.
The CSV exporter escapes every field and clearly exports only the loaded projection.

Both endpoints use strict request schemas, BFF parameter allowlists, maximum page sizes, descending
keyset pagination, and cursors cryptographically bound to the active filters. Local-day boundaries
are supplied as explicit UTC instants by the browser; no country or time zone is hard-coded.
Amounts remain integer minor units plus ISO currency and are rendered with `Intl.NumberFormat`.

## Performance

The appointment page uses one bounded relation query and one aggregate query in a single database
transaction. The audit page uses one bounded projection query. New compound indexes cover global
appointment ordering, status ordering, global audit ordering, role-filtered audit ordering, and
patient-name trigram search. Practitioner display-name search already has its governed trigram
index. No endpoint loads the full table into browser memory.

## Prototype review routes

After starting the local environment and signing in with the synthetic administrator account:

- `http://127.0.0.1:3100/#/admin/dashboard` — role-aware admin portal shell
- `http://127.0.0.1:3100/#/admin/appointments` — appointment oversight
- `http://127.0.0.1:3100/#/admin/audit` — audit trail

These three entries are marked `CONNECTED` in the executable prototype parity manifest. No signed
prototype capability was removed.

## Standards review

- Readability and extension: controller, application service, repository, contracts, cursor, BFF,
  and presentation concerns are separated; non-obvious privacy/query decisions are documented.
- Security: deny-by-default named policies, server-owned sessions, exact BFF parameters, minimal
  projections, bounded inputs, filter-bound cursors, and fully escaped CSV output.
- Performance: bounded keyset reads and indexes replace unbounded client filtering; the appointment
  summary uses one aggregate query rather than multiple count calls.
- Global behavior: no regional currency, locale, time zone, gateway, or country assumption was
  introduced.
- Maintainability: no short-term generic-resource patch was added. The module is an extendable
  administration read boundary for future reviewed oversight projections.
- Non-standard implementation: none introduced. The existing legacy generic appointment and audit
  services remain for prototype areas not yet migrated and are not used by these screens.
