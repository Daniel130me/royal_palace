# Increment 11K — Administrator operations

Status: implemented; qualification and stakeholder acceptance remain part of Increment 12.

## Scope completed

- **11K1 — Dashboard:** connects the signed administrator overview to an administrator-only
  operational projection. It reports patient and independently verified practitioner counts,
  today’s appointments, active deliveries, laboratory bookings, pending review items, expiring
  practitioner credentials, open complaints, currency-separated settled payment volume, and
  recent audit/complaint activity. It does not label payment volume as platform revenue.
- **11K2 — Complaints:** replaces the generic prototype resource with a dedicated complaint
  aggregate, controlled priority/status values, optimistic versioning, an explicit transition
  state machine, and immutable actor-attributed status history. The browser retains the signed
  summary, filters, list, detail, note, and resolution outcomes.
- **11K3 — Delivery oversight:** connects the signed administrator delivery list to the logistics
  source of truth with bounded status/search filters and keyset pagination. The projection carries
  operational identifiers, coarse destination area, organization identifiers, courier-assignment
  presence, and status; it excludes recipient identity/contact, street address, verification
  secrets, clinical content, medication lines, and patient payment details.

## Architecture and security

The existing administration module remains a projection and workflow boundary; it does not take
ownership of payments or logistics state. Policy version 30 grants dashboard and complaint access
only to `ADMINISTRATOR`; delivery oversight reuses the administrator-only logistics oversight
policy. Every decision passes the central authorization/audit service.

All requests use strict OpenAPI schemas and generated clients. Same-origin BFF routes forward only
explicitly permitted parameters; unknown expansion parameters fail closed. Browser mutations use
the existing CSRF-protected authenticated proxy. Complaint updates use expected-version compare
and set inside a transaction so concurrent reviewers cannot overwrite one another.

## Data and performance

The forward-only migration adds complaint and history tables, database checks for content,
complainant types, versions, resolution timestamps, and non-blank notes, plus practitioner
credential expiry required by the dashboard. Complaint and logistics lists use bounded keyset
pagination, server-side filters, minimal selects, and a summary query in one transaction. B-tree
indexes cover ordered status/priority queues; trigram indexes cover complaint number/subject and
delivery number/locality search. The representative PostgreSQL plan harness loads 5,000 complaint
and 5,000 logistics records and asserts the intended queue/search indexes.

The drift gate also exposed update-action drift left by the published clinical-related-actions
migration. A separate forward-only corrective migration aligns those foreign keys with the governed
Prisma relations; the published migration remains immutable.

The dashboard intentionally issues one database round trip containing independent aggregate
subqueries instead of many network calls. If measured production volume makes exact global counts
too costly, a transactional read model can replace those subqueries without changing the public
contract; no approximate or stale counter is silently presented now.

## Prototype review routes

After starting the local stack and signing in with the synthetic administrator account:

- `http://127.0.0.1:3100/#/admin/dashboard` — operational overview and attention queue
- `http://127.0.0.1:3100/#/admin/complaints` — complaint triage and status workflow
- `http://127.0.0.1:3100/#/admin/deliveries` — privacy-minimized delivery oversight

All three entries are `CONNECTED` in the executable parity manifest. No signed prototype
capability was removed.

## Standards review

- **Readable and extendable:** contract, controller, application policy/state machine, repository,
  BFF, and presentation concerns remain separate; the new complaint aggregate is not generic CRUD.
- **Security:** deny-by-default authorization, audited access, strict contracts, exact BFF
  allowlists, CSRF-protected mutation, optimistic concurrency, database invariants, and minimal
  projections are enforced independently of the browser.
- **Performance:** one dashboard round trip, bounded keyset lists, aggregate summaries, narrow
  selects, search/queue indexes, and representative query-plan assertions avoid unbounded browser
  reads and N+1 access.
- **Global behavior:** no gateway, locale, country, time zone, or currency is fixed. Monetary totals
  remain integer minor units separated by ISO currency.
- **Maintainability:** named transition rules and governed enums replace stringly typed resource
  updates; future complaint intake channels can write the same aggregate without changing triage.
- **Non-standard implementation:** inherited clinical foreign-key update-action drift was found and
  corrected forward instead of being ignored or patching published history. Exact global dashboard
  counts are explicitly identified as a measurement point for a future read model, not hidden as a
  scalability claim.
