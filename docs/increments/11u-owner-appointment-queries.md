# Increment 11U — owner-scoped appointment queries

## Outcome

Patient and practitioner appointment lists now use the production scheduling aggregate. The API
derives ownership from the authenticated principal; clients cannot choose a patient or practitioner
identifier. The signed prototype list screens remain available at `#/patient/appointments` and
`#/provider/appointments`.

## Implementation

- Added explicit patient-list and practitioner-list authorization policies. Exact role and principal
  ownership are required; platform support roles do not inherit these personal list permissions.
- Added bounded keyset pagination ordered by appointment start and UUID. Opaque cursors include a
  version and SHA-256 filter hash, preventing reuse after scope, search, day-bound, or owner changes.
- Added an indexed patient/start-time access path. The existing practitioner/start-time index is
  reused. Practitioner name search uses the existing patient-name trigram indexes.
- Added server-side scopes for upcoming, completed, unsuccessful, all, and caller-local today. The
  browser supplies explicit UTC bounds for its local day; no country, time zone, or currency is
  hard-coded.
- Added a minimal practitioner projection containing only patient ID and display name. Clinical
  history remains behind the governed clinical-record boundary.
- Added OpenAPI definitions, generated client types, strict BFF parameter allowlists, UUID path
  validation, and cursor-based “load more” behavior.
- Replaced the legacy generic-resource calls in both appointment-list screens and in the
  practitioner appointment detail.

## Prototype parity

- `#/patient/appointments`: connected to production owner-scoped reads.
- `#/provider/appointments`: connected to production owner-scoped reads, search, day scopes, and
  encounter start.
- `#/provider/appointment?id=<appointment UUID>`: production appointment and minimal patient
  identity are connected. The signed intake section remains explicitly `IN_PROGRESS`; it must be
  restored from a governed intake aggregate, not from unrestricted prototype data.

No approved screen or route has been removed. The unsafe legacy data source was replaced where a
production boundary exists, and the remaining intake capability stays visible in the parity register
until its secure source is implemented.

## Verification

- API and web TypeScript checks pass.
- API suite: 1,122 passed, 1 skipped.
- Web suite: 56 passed.
- Scheduling BFF tests cover parameter allowlisting, patient search rejection, and exact UUID paths.
- Authorization and scheduling service tests cover exact owner roles and cursor/filter binding.

## Engineering-standard review

- **Readable and extendable:** contracts, policy, application, repository, presentation, BFF, and UI
  responsibilities remain separated.
- **Performance:** all reads are bounded; keyset pagination avoids offset scans; owner/start indexes
  support the dominant access paths; no per-row queries were introduced.
- **Security:** ownership is server-derived, role-specific, and audited through the authorization
  service. Practitioner disclosures are deliberately minimal.
- **Global behavior:** the client supplies local-day UTC bounds and all monetary data retains its
  stored ISO currency.
- **Non-standard implementation flagged:** the practitioner intake display previously depended on
  the generic prototype resource API. It is not presented as production-complete and must be backed
  by a governed intake model before launch.
