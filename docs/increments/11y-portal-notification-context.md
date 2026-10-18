# Increment 11Y — Shared portal notification context

Status: implementation complete; the patient and practitioner portals remain partially open for
the separately governed capabilities recorded in the parity manifest.

## Outcome

The patient and practitioner shells now share one authenticated context with every page below
them. Production notification-inbox summaries supply the shell badge and the patient dashboard's
recent-update cards, replacing the prototype notification resource and eliminating a separate
profile-and-notification request from each hook consumer. Read actions publish a browser-local
refresh signal so the shell badge stays consistent with the inbox without polling.

The summary deliberately contains only the notification template title, opaque reference, time,
and read state. It does not copy clinical or payment content into the shell.

## Browser routes

- `#/patient/dashboard`
- `#/patient/notifications`
- `#/provider/dashboard`
- `#/provider/notifications`

The patient and practitioner notification badges update after an item or all items are marked read.
The patient dashboard displays at most three privacy-safe recent summaries.

## Security and performance

- Notification ownership is derived by the production API from the authenticated session.
- Portal state is cleared before an authenticated-subject transition is loaded, preventing stale
  data from one subject being rendered for another.
- A single provider instance owns portal context, preventing each page and shell from issuing
  duplicate profile and notification queries.
- Inbox and summary requests are bounded; no background polling or unbounded notification read was
  introduced.
- A notification failure degrades the badge only and cannot make a clinical portal unusable.

## Deliberately open

The patient family/dependant profile resource and practitioner profile resource still use the
quarantined prototype API while their governed production aggregates remain open. This is an
explicit migration boundary, not evidence that those legacy APIs are production-ready. It is why
both portal capabilities remain `IN_PROGRESS` in the parity manifest.

## Standards review

- **Readable and extendable:** shared notification mapping and refresh semantics live in one small
  module, while each portal owns one typed context.
- **Security first:** session-derived notification ownership, minimal summaries, subject-transition
  clearing, and fail-closed production API policies are preserved.
- **Performance conscious:** duplicate hook reads are consolidated and all inbox requests are
  bounded.
- **No hard-coded assumptions:** no vendor, country, currency, locale, or notification category is
  fixed in the portal context.
- **Non-standard implementation flagged:** remaining generic patient-family and practitioner-profile
  reads are recorded above and are not silently presented as production boundaries.
