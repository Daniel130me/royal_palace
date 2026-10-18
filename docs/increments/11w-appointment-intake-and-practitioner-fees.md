# Increment 11W — Appointment intake and practitioner fee history

Status: implementation complete; stakeholder visual acceptance remains open.

## Outcome

The signed pre-consultation intake capability is restored on the production booking path. Intake is
no longer an unstructured prototype field: it is an appointment-owned aggregate created atomically
with the reservation. The patient supplies a bounded reason and optional symptom context, records
explicit versioned consent, and can withdraw that consent with optimistic concurrency. The assigned
practitioner can read intake content only through the already owner-scoped appointment endpoint;
withdrawal immediately redacts the content from that projection.

Administrator practitioner detail also includes the bounded, effective-dated consultation-fee
history controlled by the platform. Amounts remain integer minor units and are presented per stored
ISO currency. No provider earning percentage, payout destination, or transfer claim is invented.

## Browser routes

- `#/patient/book?providerId=<practitioner UUID>` — choose a slot, complete intake, and consent.
- `#/patient/appointment?id=<appointment UUID>` — review or withdraw intake consent.
- `#/provider/appointment?id=<appointment UUID>` — review the consent-governed intake.
- `#/admin/provider?id=<practitioner UUID>` — review verification data and fee history.

## Security and performance

- Booking, intake creation, payment creation, and the idempotency result share one serializable
  transaction; the idempotency hash includes the complete intake request.
- Reason and symptom lengths are enforced at the API and database boundary.
- Patient ownership and practitioner assignment are derived from authenticated database records;
  neither identity is accepted from the browser.
- Withdrawal is owner-only, version checked, and fail-closed. Revoked content is redacted from the
  practitioner projection while retained for governed audit/retention handling.
- Appointment lists do not join intake data. Only point-detail reads load it, avoiding unnecessary
  work and disclosure on growing lists.
- Practitioner fee history is capped at 100 records in the administrator detail projection.

## Deferred commercial decisions

Provider earnings and payouts remain pending because the prototype estimated earnings using a
hard-coded percentage. A production implementation needs approved effective-dated provider payout
rules, reconciliation semantics, payout-provider qualification, and jurisdiction-specific finance
review. Real payout enrollment and execution remain disabled.

## Standards review

- **Readable and extendable:** intake has a dedicated model and typed contract instead of a JSON
  field; consent state can evolve without changing the appointment aggregate.
- **Security first:** explicit consent, owner/assignment checks, redaction after withdrawal, strict
  schemas, CSRF protection, and optimistic concurrency are enforced server-side.
- **Performance conscious:** no intake join is added to list queries; point reads and bounded fee
  history avoid N+1 calls and unbounded scans.
- **No hard-coded assumptions:** no country, provider, currency, rate, or regional regulator is
  introduced. The only fixed consent code versions the exact UI disclosure text.
- **Non-standard implementation removed:** unrestricted `intakeForm` JSON and the provider screen's
  hard-coded 73% earnings estimate are not treated as production facts.
