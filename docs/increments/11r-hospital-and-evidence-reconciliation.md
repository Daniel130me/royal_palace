# Increment 11R — hospital portal and evidence reconciliation

Status: implemented; stakeholder visual acceptance remains part of Increment 12.

## Scope completed

- The signed hospital portal now reads the verified, public-safe hospital projection from the
  production PostgreSQL discovery boundary. It no longer calls the prototype generic resource API.
- Hospital identity is derived from the authenticated session. The browser cannot select another
  organization through a query parameter or request body.
- Services and country-aware locations use the same approved projection patients search. Private
  registration, application, document, staff, payment, and clinical data are not returned.
- The administrator reports and settlements rows are reconciled to the already-completed 11G
  production implementation and evidence.
- The manager resources row is reconciled to 11M. Its approved responsibilities and privacy-safe
  escalation guidance are intentionally static product guidance; false agreement acceptance and
  placeholder downloads were removed in 11M.

## Query and security review

- The hospital screen performs one bounded primary-key discovery read with the existing bounded
  service and location relations; it adds no list scan or per-service browser request.
- Only administrator-approved public fields are rendered. Authentication supplies the hospital id,
  while the public projection remains safe even if requested directly.
- No provider, jurisdiction, country, currency, or cloud-specific default was introduced.

## Browser review

- Hospital profile and service catalogue: `#/hospital/dashboard`
- Administrator settlement and payout governance: `#/admin/settlements`
- Administrator reporting: `#/admin/reports`
- Manager responsibilities and privacy guidance: `#/manager/resources`

## Deliberate boundaries

- A hospital does not own or control practitioner profiles, practitioner fees, verification, or
  clinical records.
- Hospital operational expansion beyond the signed single-screen portal must be requested and
  approved as a new product capability; it is not fabricated under prototype parity.
- Technical connection does not claim stakeholder visual UAT or production launch approval.
