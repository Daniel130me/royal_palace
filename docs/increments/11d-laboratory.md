# Increment 11D — laboratory

## Status

**In progress. Synthetic/test data only. Not approved for real clinical use.**

This increment replaces the approved laboratory prototype surfaces with a controlled
production aggregate. It does not remove or narrow the signed prototype scope.
Checkpoint 11D1 establishes the durable request and booking boundary. Checkpoint 11D2A
adds the authenticated production API and BFF boundary. Checkpoint 11D2B connects the
approved request, booking, and operational dashboard surfaces to that boundary. Checkpoint
11D3A establishes the durable result, attachment, amendment, and critical-result integrity
model. Checkpoint 11D3B adds the secured structured-result application/API boundary and
exact browser allowlists. Attachment transfer, result screens, critical escalation execution,
commercial, notification, settings, and remaining supporting-screen cutover work remain
tracked below and must be completed before parity can be claimed.

## Controlling rules

- A verified practitioner creates a laboratory request for the same patient and
  practitioner as a confirmed or completed appointment.
- The clinical request is immutable. Corrections will use an explicit replacement or
  cancellation workflow rather than editing issued clinical facts.
- The patient chooses an active, verified laboratory. The selected laboratory receives
  only the information needed to fulfil that request.
- Managers and support staff have no laboratory clinical-data access. Administrators
  do not receive implicit clinical access merely because they administer the platform.
- Laboratory staff may act only through an exact organization membership. A global
  platform role is not a substitute for membership.
- Completion requires a completed booking. Request and booking history is append-only,
  and terminal states cannot be reopened.
- Country, currency, language, provider, and cloud-region assumptions are not embedded
  in the aggregate.
- Protected-environment activation remains disabled until Nigerian clinical,
  laboratory, privacy, security, and legal qualification is recorded. Nigeria is the
  first launch profile, not a global application default.

## Delivery checklist

### 11D1 — request and booking integrity foundation

- [x] Add PostgreSQL request, booking, and append-only status-history aggregates.
- [x] Enforce appointment ownership, active service taxonomy, verified-laboratory
      routing, immutable clinical identity, one active booking, legal state
      transitions, terminal-state integrity, and completed-booking evidence in the
      database.
- [x] Add bounded owner/queue indexes and optimistic concurrency fields.
- [x] Add explicit application-layer request and booking state machines with tests.
- [x] Add named, default-deny authorization policies for the issuing practitioner,
      owning patient, and exact laboratory membership; deny managers and support.
- [x] Add repository/application services, booking idempotency, business and
      authorization audit events, generated OpenAPI contracts, and exact BFF routes.
- [ ] Add representative laboratory query-plan/load evidence and protected-environment
      telemetry validation before 11D qualification.

### 11D2 — request routing and laboratory operations

- [x] 11D2A provides verified-practitioner request creation, patient-owned laboratory
      selection, organization-scoped queues and booking detail, bounded cursor
      pagination, optimistic transitions through processing/cancellation, synthetic-only
      fail-closed activation, and privacy-minimized laboratory projections. Result-ready
      and completion transitions remain reserved for verified result publication.
- [x] Connect practitioner request creation and patient laboratory selection using the
      controlled service catalogue and verified laboratories that offer the exact test.
- [x] Add laboratory queues, scheduling, specimen collection, processing, cancellation,
      bounded cursor pagination, concurrency tests, and privacy-minimized projections.
- [x] Surface bounded cursor pagination in practitioner, patient, request-queue, and
      booking-queue screens so older work remains reachable without unbounded reads.
- [x] Connect the approved dashboard, bookings, and request list/detail screens without
      exposing unassigned requests or full patient records.
- [x] Retire the replaced ungated prototype create, booking, and status mutation routes
      after confirming that no production or prototype screen still consumes them.
- [ ] Connect the approved services, notifications, and settings screens; preserve their
      current prototype surfaces until their production contracts are available.
- [ ] Add durable home-collection instructions and laboratory commercial pricing/payment
      to their owning fulfilment and commercial aggregates. These approved controls are
      tracked rather than encoded into clinical request text or temporary browser state.

### 11D3 — result and critical-result workflow

- [x] 11D3A adds structured components, quarantined attachment metadata, append-only
      amendment chains, verification/publication actors, status history, content digests,
      bounded owner/organization indexes, and PostgreSQL guards that prevent published
      result mutation.
- [x] 11D3A adds durable critical-result ownership, acknowledgement deadlines,
      acknowledgement/escalation/resolution states, and notification-attempt linkage.
      The acknowledgement window will be supplied by qualified policy configuration at
      publication time; it is deliberately not a database or country-specific constant.
- [x] 11D3B adds result drafting, review, publication, amendment, bounded
      patient/practitioner/laboratory reads, acknowledgement, and resolution APIs with
      generated contracts, exact BFF allowlists, optimistic concurrency, immutable published
      output, privacy-safe notifications, and default-deny relationship authorization.
- [ ] Add result-attachment registration/upload/scan/download APIs over the existing
      quarantine-first attachment records. No attachment may be published or downloaded
      before clean-scan evidence exists.
- [ ] Add the bounded critical-result escalation worker and privacy-safe inbox/email
      notifications. External messages must contain no clinical values or diagnoses.
- [ ] Connect patient/practitioner result views and laboratory result creation/results
      screens using generated contracts.

### 11D4 — commercial parity and qualification

- [ ] Connect laboratory charging to the shared payment-subject boundary without
      coupling clinical completion to settlement.
- [ ] Implement laboratory settlements/payouts and reporting only in their planned
      shared financial slices; retain the approved navigation until connected.
- [ ] Complete clean/upgrade migration tests, failure/concurrency tests, load/query-plan
      evidence, prototype parity verification, and Nigerian qualification/UAT.
- [ ] Keep all real laboratory processing disabled until the approval evidence is
      complete.

## Database deployment and recovery

Migration `20261012240000_laboratory_request_booking_foundation` is additive and must
deploy before API code that references laboratory records. Application rollback uses
the preceding API binary while retaining all request, booking, and history rows. Do not
delete clinical records to roll back. Before protected deployment, rehearse the
forward migration and binary rollback against a representative sanitized copy and
verify backup restoration.

Migration `20261012241000_align_commercial_constraint_names` is a metadata-only repair
for databases that applied older names before the corresponding historical migration
files were corrected. It conditionally renames only legacy identifiers, preserves all
data and referential actions, and is a no-op on clean installs that already use the
canonical names.

Migration `20261012242000_laboratory_service_scope_guard` hardens booking acceptance so
the selected verified laboratory must actively offer the request's controlled service.
It replaces only the booking-scope trigger function and does not rewrite stored rows.

Migration `20261013100000_laboratory_result_integrity_foundation` is additive. It creates
the result, component, attachment, status-history, critical-result, and critical-notification
records plus database guards for scope, state shape, immutable publication, clean attachment
review, and append-only history. Rollback retains these clinical records; destructive down
migration is forbidden. The API must continue ignoring the new tables if its binary is rolled
back.

## Standards walkthrough

- **Readable and structured:** database, state-machine, authorization, and future
  application/presentation responsibilities are explicit and separated.
- **Security and privacy:** access defaults to deny; only record owners and exact
  selected-laboratory members receive access. No manager/support shortcut exists.
- **Performance:** patient, practitioner, laboratory queue, request, and status paths
  have bounded composite indexes; completion checks stop after the first matching row.
- **Maintainability:** status names and transition maps are centralized; opaque UUIDs,
  UTC timestamps, and optimistic versions follow platform conventions.
- **Extensibility:** the request references controlled service taxonomy and remains
  independent of country, currency, payment vendor, or cloud provider.
- **No short-term patching:** invariants are enforced in PostgreSQL as well as domain
  code, history is append-only, and terminal records cannot be silently reopened.
- **Non-standard/open work:** the patient results tab temporarily retains its
  patient-filtered prototype result reader until 11D3 replaces it atomically; it is not
  a production clinical-result boundary. The new durable result tables are intentionally
  unreachable until the authorization, application, API, worker, and browser boundaries are
  completed. Attachment transfer, result screen cutover, critical escalation execution,
  home collection, commercial, supporting-screen, query-plan/load, and qualification work
  remains explicitly release-blocking. No approved screen or navigation destination has been
  removed. Laboratory publication currently permits one authorized laboratory member to
  review and publish; whether Nigerian qualification requires independent second-person
  verification is an explicit clinical-governance decision and must not be silently assumed.
