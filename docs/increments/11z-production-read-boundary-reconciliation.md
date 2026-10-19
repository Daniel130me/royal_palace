# Increment 11Z — Production read-boundary reconciliation

## Outcome

This checkpoint removes the remaining reachable generic prototype reads from the public,
patient, practitioner, laboratory, and administrator reporting surfaces. It preserves the
signed routes and screen intent while ensuring that production data is obtained only through
owner-derived, role-authorized, bounded projections.

## Implemented

- Public pharmacy and laboratory discovery now share the verified, cursor-bounded public
  organization projection instead of generic resource collections.
- Patient payments use an owner-derived, keyset-paginated projection that excludes payment
  provider references and keeps currencies separate.
- Administrator operational reports use one bounded aggregate query for appointment activity,
  eligible payment totals, organization earnings, and practitioner activity. The response
  contains no patient identity and never combines currencies.
- The practitioner verification screen uses a dedicated owner projection with bounded
  credentials, affiliations, documents, languages, and status history.
- Practitioner patient detail and encounter workspaces use an exact clinical-relationship
  projection. Appointment filtering is practitioner-owned, patient-specific, cursor-bound, and
  included in the cursor filter hash.
- Patient and practitioner portal contexts now use owner-derived account projections. They do
  not retain another authenticated subject's data across session changes.
- Practitioner earnings and payouts, administrator pharmacy commissions, patient consent, and
  family/dependant actions remain visible at their signed routes but fail closed. The former
  demo calculations, hard-coded administrator identity, browser-only consent, and fabricated
  dependant data were removed. These capabilities remain open in the parity register until the
  material rules in `MATERIAL_DECISIONS_HANDOFF.md` are approved.

## Database and performance

- `payments_created_id_idx` supports the administrator time-range aggregation.
- Patient payment history uses the existing patient/created/id index.
- Exact practitioner-patient access is enforced in SQL through the clinical encounter and
  practitioner-principal relationship; it returns one aggregate row.
- Growing lists remain capped at 50 records per request and use stable cursor pagination.

## Security and privacy

- Patient identity for practitioner screens is disclosed only after an existing clinical
  relationship is proven.
- Patient payment responses exclude gateway provider references.
- Administrator reports contain aggregate counts and money totals only.
- Demo-only mutations are fail-closed instead of silently writing prototype storage.
- All money remains integer minor units plus ISO currency; cross-currency totals are not added.

## Prototype screens and browser routes

- Public pharmacies: `/#/public/pharmacies`
- Public laboratories: `/#/public/laboratories`
- Patient payments: `/#/patient/payments`
- Patient family: `/#/patient/family` (governance gate shown)
- Patient record access: `/#/patient/consent` (governance gate shown)
- Practitioner dashboard: `/#/provider/dashboard`
- Practitioner verification: `/#/provider/verification`
- Practitioner patient record: `/#/provider/patient?id=<relationship-scoped-patient-id>`
- Practitioner encounter: `/#/provider/encounter?id=<owned-encounter-id>`
- Practitioner earnings and payouts: `/#/provider/earnings`, `/#/provider/payouts`
- Laboratory dashboard: `/#/laboratory/dashboard`
- Administrator reports: `/#/admin/reports`
- Administrator pharmacy commissions: `/#/admin/pharmacy-commissions` (governance gate shown)

## Engineering-standard review

- Readability: capability-specific services, projections, and route allowlists are used; no new
  generic repository or dynamic CRUD boundary was introduced.
- Maintainability and extension: shared discovery and governed-pending components remove
  duplication, while generated OpenAPI contracts remain the web/API boundary.
- Performance: reads are exact or bounded, growing lists are paginated, report aggregation is
  one database round trip, and supporting indexes are migration-managed.
- Security: subject and organization scope comes from the authenticated session; client-supplied
  identifiers are filters inside an already-authorized owner scope, never authorization facts.
- No magic/hard-coded assumptions: money, countries, languages, credentials, and organizations
  are data-driven. No country or currency default was added.
- Flagged non-standard implementation: the signed weekly practitioner availability screen still
  stores a browser-only matrix even though its route is marked connected. It must be replaced by
  a versioned recurrence/exception aggregate after the booking-mode policy in
  `MATERIAL_DECISIONS_HANDOFF.md` is approved; this is tracked as remaining work and is not treated
  as production-ready evidence.

## Remaining gates

Only the open items recorded in `MATERIAL_DECISIONS_HANDOFF.md`, provider/environment
qualification, the availability recurrence correction above, protected migration/restore and
load evidence, independent security/privacy/clinical review, and stakeholder UAT may advance the
affected capabilities to production launch.
