# Increment 11Q — provider patient roster and referral lifecycle

## Outcome

This checkpoint production-connects the client-approved provider patient roster and referral
screens without retaining the prototype's unsafe generic-resource access patterns.

## Patient roster

- The roster is derived only from clinical encounters belonging to the authenticated, verified
  practitioner.
- Search, grouping, encounter counts, last-encounter ordering, and keyset pagination execute in one
  bounded database query. The browser no longer performs an appointment scan followed by one patient
  request per result.
- The list response intentionally contains only patient ID, display name, encounter count, and last
  encounter timestamp. Phone, email, demographics, allergies, and clinical content are not exposed by
  the collection endpoint.
- Selecting a patient continues to the existing policy-protected patient-detail flow.

## Referrals

- A referral can be open by specialty or addressed to a specific verified practitioner. Recipient
  display names are resolved server-side; the browser cannot invent the identity attached to a
  practitioner ID.
- Sent lists are restricted to the authenticated sender. Received lists are restricted to the exact
  named recipient. Open referrals are not globally claimable in this increment.
- Recipients can accept or decline only an `ACTIVE` referral addressed to them. Decisions use an
  idempotency key, expected version, a serializable transaction, immutable status history, and an
  audit event.
- Referral acceptance does not grant broad patient-record access. Any future access grant must have
  its own consent, purpose, expiry, revocation, and audit model before that capability is enabled.

## Database and performance

- `recipient_practitioner_id` is an optional foreign key so historic and open-by-specialty referrals
  remain valid.
- Sender and recipient indexes support the two provider inbox directions.
- Status history is append-only and indexed by referral and occurrence time.
- Patient roster filtering uses existing patient trigram indexes and a grouped encounter projection;
  no patient-record N+1 query remains.

## Qualification boundary

Clinical workflows remain synthetic-only through the existing configuration gate. The real clinical
workflow must remain disabled until the named clinical, privacy, security, and jurisdiction reviewers
complete qualification. This checkpoint does not represent production clinical approval.

## Prototype screens

- `#/provider/patients`
- `#/provider/referrals`
- The existing referral dialog inside provider patient/encounter flows now records exact recipients.

## Standards review

- **Readable and extendable:** contract, controller, service, repository, BFF, generated client, and
  screen layers retain the existing modular boundaries.
- **Secure:** exact-principal scoping, least-data list projections, strict input validation,
  idempotency, optimistic concurrency, immutable history, and audit events are enforced server-side.
- **Performance-aware:** bounded keyset pagination and indexed single-query projections replace
  browser-side joins and N+1 calls.
- **No hard-coded geography or currency:** neither feature introduces regional assumptions.
- **Flagged non-standard behavior removed:** generic resource mutation and implied record-access grants
  were deleted rather than wrapped or patched.
