# Increment 11M — Manager privacy parity

Status: implementation complete; stakeholder visual acceptance remains open.

## Outcome

The signed manager pharmacy and laboratory screens remain available, but their production data
boundary now reflects the approved manager role. They are referral-status views, not organization
portfolios. Managers can see only the referral label, a privacy-safe reference, organization type,
application status, and lifecycle timestamps.

The former generic manager data path exposed organization contact information, gross payments,
assignment history, and organization-level support data. Those reads are no longer used by these
screens. The replacement API authorizes the active manager, constrains every query by that manager's
profile, uses keyset pagination, supports indexed server-side organization-type filtering, and
projects only explicitly selected fields.

## Production-connected signed screens

- `#/manager/pharmacies`
- `#/manager/pharmacy?id=<referral-attribution-id>`
- `#/manager/laboratories`
- `#/manager/laboratory?id=<referral-attribution-id>`
- `#/manager/notifications`
- `#/manager/settings`

The resources screen has corrected role, referral, privacy, and escalation guidance. It remains
`IN_PROGRESS` in the parity register because governed, versioned programme agreements and downloads
have not yet been implemented; the screen does not fabricate acceptance or placeholder documents.

## Notification policy

Manager notifications now use the production inbox with bounded cursor pagination and authenticated
recipient scope. Settings use durable notification preferences. Security and transactional email are
shown as mandatory, marketing email requires explicit opt-in, and external messages are described as
privacy-safe summaries without clinical information.

## Parity-register reconciliation

The laboratory and logistics rows previously remained `PENDING` even though checkpoints 11D and 11E
had already connected every signed screen to their authenticated production boundaries. This
checkpoint corrects those rows to `CONNECTED` using their original checkpoint evidence. It does not
mark stakeholder UAT, provider qualification, or launch acceptance complete.

## Deferred scope

- Manager payout destination and payout screens remain pending the manager commercial/payout model.
- Governed programme agreement publishing, versioning, acceptance evidence, and protected downloads
  remain pending.
- Stakeholder visual comparison and acceptance remain required before launch.

## Standards review

- Readability and extension: one referral contract is shared by list and detail screens; the API,
  generated client, BFF, and UI use the same schema.
- Security: ownership is derived from the authenticated principal; the detail query requires both the
  attribution and manager profile; no organization, patient, document, clinical, or gross-payment
  fields are selected.
- Performance: lists are bounded to 50 records, use keyset cursors, and filter by organization type in
  PostgreSQL. Detail uses a targeted indexed lookup rather than scanning list pages.
- Global readiness: organization types and timestamps are governed values; no country, currency,
  locale, payment provider, or regional assumption was added.
- Maintainability: stale portfolio-management language and simulated local preferences were replaced,
  not patched around. Generated OpenAPI types prevent contract drift.
- Non-standard implementation: the legacy generic `/api/manager/organizations*` and manager-data code
  still exists for remaining migration analysis, but these signed screens no longer call it. It must
  be retired once all verified consumers are removed.
