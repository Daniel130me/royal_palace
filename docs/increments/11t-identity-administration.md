# Increment 11T — identity-principal administration

Status: connected; stakeholder prototype-parity review remains required before release acceptance.

## Scope completed

- The administrator users screen now reads a bounded, keyset-paginated identity-principal
  projection instead of prototype data.
- Administrators can filter by account status and active platform or organization role, and can
  search by exact account ID, verified email address, or the minimum role-appropriate display
  name.
- Account access can be activated or disabled using optimistic concurrency and a mandatory audit
  reason. Disabling an account revokes every active session in the same serializable transaction.
- Passwords, MFA, passkeys, recovery, and external identity credentials remain exclusively owned
  by the qualified identity provider; the platform does not expose or reset them.

## Security and edge-case review

- A dedicated `ADMINISTER_IDENTITY_PRINCIPALS` policy permits only the administrator role. The BFF
  accepts a strict allowlist of bounded filters, validates account IDs, and applies CSRF protection
  to status changes.
- An administrator cannot disable their own account or the final active platform administrator.
  PostgreSQL transaction advisory locking serializes status changes around the final-administrator
  check.
- Stale versions, repeated no-op status changes, missing accounts, malformed UUIDs, and unknown
  request properties fail with stable non-sensitive errors.
- Every successful transition records an immutable audit event with actor, target, request ID,
  previous status, next status, and the supplied reason.
- Only active role assignments and non-invalidated verified recipient endpoints are projected.
  Clinical, financial, application, and organization records are not returned by this capability.

## Query and architecture review

- Listing uses descending `(updated_at, id)` keyset pagination. Status-specific ordering indexes and
  a trigram index for normalized verified-email search avoid unbounded offset scans.
- The list and summary are fetched in one database round trip. Each principal is returned through
  one bounded Prisma projection, with no per-row browser or repository queries.
- Contracts, application service, repository, controller, generated OpenAPI client, BFF, and page
  remain separated so future governed role-assignment administration can be added without
  expanding this status-control boundary.
- No country, currency, identity vendor, or provider-specific credential behavior is hard-coded.

## Focused validation

- API, web, generated client, and shared-contract TypeScript checks pass.
- API and web lint pass without errors; the updated administrator screen has no lint warnings.
- Focused API authorization and service tests pass: 862 tests.
- Focused web administration BFF tests pass: 4 tests.
- Prisma schema validation passes, and the complete 56-migration clean-install, upgrade, repair,
  backfill, invariant, concurrency, and constraint verifier passes against disposable PostgreSQL
  databases, including the new identity-administration indexes.
- Prototype parity verification remains part of the repository gate and is rerun after the scope
  manifest update.

## Prototype screen and browser review

- Signed administrator users screen: `#/admin/users`
- Review with an administrator test identity. Search, status and role filters, pagination, status
  transition reason, session revocation messaging, and self/final-administrator safeguards are the
  implemented production outcomes.
