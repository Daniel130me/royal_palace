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
exact browser allowlists. Checkpoint 11D3C extends the shared quarantine-first document
pipeline to result attachments and adds bounded, concurrency-safe critical-result escalation.
Checkpoint 11D3D connects secure result entry, laboratory/patient/practitioner result views,
clean-attachment downloads, controlled draft/review publication, critical acknowledgement,
and the laboratory critical-results/dashboard surfaces. Checkpoint 11D4A restores durable
home collection through an immutable structured address snapshot, an explicit per-service
laboratory capability, and role-specific privacy projections. Checkpoint 11D4B connects
the approved service catalogue, notification inbox, and laboratory profile/settings
screens to exact-organization production contracts. Checkpoint 11D4C adds administrator-
governed, effective-dated service prices, immutable booking price snapshots, and hosted
checkout through the shared payment-subject boundary while keeping clinical state independent
from settlement. Checkpoint 11D4D adds immutable organization earnings, currency-separated
daily/monthly/custom-range reporting, concurrency-safe payout reservation, finance review,
and conservative refund/dispute holds. Real payout execution and the remaining supporting-screen
work remain tracked below and must be completed before parity can be claimed.

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
- [x] 11D4B connects the approved services, notifications, and settings screens. A single
      exact-organization query returns identity, primary location, registration, and controlled
      service offerings; notification reads remain session-derived, bounded, and receipt-based.
      The shared portal context prevents duplicate workspace queries. Centrally governed pricing,
      billing, team administration, and verified review aggregates remain visibly unconfigured
      rather than being simulated or removed.
- [x] Add durable home-collection instructions to the booking fulfilment aggregate. The
      patient chooses facility or home collection; home collection requires an explicitly
      enabled capability for the exact laboratory service and stores an immutable structured
      address snapshot rather than clinical request text or temporary browser state.
- [x] Add laboratory commercial pricing/payment to its owning commercial aggregate.

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
- [x] 11D3C adds result-attachment registration/upload/scan/download APIs over the existing
      quarantine-first attachment records. No attachment may be published or downloaded
      before clean-scan evidence exists.
- [x] 11D3C adds the bounded critical-result escalation worker and privacy-safe inbox/email
      notifications. External messages must contain no clinical values or diagnoses.
- [x] Connect patient/practitioner result views and laboratory result creation/results
      screens using generated contracts.
  - [x] Connect the laboratory result list, clean attachment downloads, and controlled
        draft/review publication actions without retaining the legacy result mutation route.
  - [x] Connect secure result entry plus patient and practitioner result views, replace the
        laboratory critical-results/dashboard readers, and retire the unauthenticated legacy
        result publication action and direct generic result collection.

### 11D4 — commercial parity and qualification

- [x] Replace patient-record, practitioner-dashboard, practitioner-patient, and encounter
      result widgets with bounded published-result projections. Practitioner patient views
      use an indexed server-side patient filter while retaining practitioner ownership, and
      published pagination follows `publishedAt` so the existing owner indexes are usable.
- [x] Restore the approved facility/home collection choice in the patient booking flow,
      expose only capable laboratories for the requested service, and provide the exact
      selected laboratory with the collection address and instructions. Ordering
      practitioners see the mode but not the home address.
- [x] Connect laboratory charging to the shared payment-subject boundary without
      coupling clinical completion to settlement.
- [x] Implement laboratory settlements/payouts and reporting in a shared organization-finance
      slice. Successful verified payments create earnings exactly once; payout requests reserve
      only available same-currency earnings under serializable isolation; finance review enforces
      separation of duties; refunds, reversals, and disputes fail safe to a reconciliation hold.
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

Migration `20261014100000_laboratory_home_collection` is additive. Existing bookings are
backfilled as facility collection. It adds an opt-in per-service home-collection capability,
an immutable one-to-one home-address snapshot, deferred cross-table shape enforcement, and
database enforcement that the selected laboratory explicitly offers home collection for the
requested service. Application rollback may retain these columns and rows; destructive down
migration is forbidden.

Migration `20261014130000_add_laboratory_payment_purpose` adds the laboratory booking
payment purpose in its own transaction because PostgreSQL requires a newly added enum value
to be committed before it is referenced. Migration
`20261014131000_laboratory_commercial_pricing` then adds effective-dated governed prices,
immutable laboratory booking commercial snapshots, and the exact-one payment-subject
relationship. Database triggers reject missing, stale, mismatched, or mutable commercial
facts even if application validation is bypassed. Existing historical bookings remain
nullable until a separately reviewed data migration can prove their commercial facts; every
new booking must contain an exact active price snapshot and matching payment.

Migration `20261014160000_organization_financial_boundary` is additive. It creates immutable
payment-linked organization earnings, payout requests, and exact earning allocations with
positive-amount, currency-shape, uniqueness, and referential constraints. Application rollback
retains all financial records. Payout approval is deliberately distinct from provider execution;
no bank-transfer provider reference or paid status is fabricated by this checkpoint.

## Checkpoint 11D4C completion report

- Administrators can review all controlled hospital, pharmacy, and laboratory services on
  the approved Pricing screen, create an immutable draft, and activate it after fresh
  step-up authentication. Activating a price retires the prior active version atomically.
- A patient laboratory booking now snapshots the patient charge, laboratory payout, and
  ISO 4217 currency and creates the matching payment in one serializable transaction.
- Hosted checkout uses the existing vendor-neutral payment adapter. Payment webhooks update
  financial state only; they cannot advance, complete, or rewrite the clinical laboratory
  workflow.
- The patient Laboratory screen shows the captured price and offers checkout only while the
  payment is payable. The laboratory Services screen shows the current centrally governed
  price without granting the laboratory authority to change it.
- Prototype screens covered by this checkpoint are available at `#/admin/pricing`,
  `#/patient/laboratory`, and `#/laboratory/services`.

## Checkpoint 11D4D completion report

- A successful laboratory booking payment creates one organization earning from the immutable
  booking price snapshots. Duplicate provider events cannot duplicate the earning.
- Laboratory staff can review currency-separated daily, monthly, or bounded custom-range
  settlement reports and request a payout only from currently available earnings.
- Each payout request reserves exact earning allocations under serializable isolation and an
  idempotency key, preventing duplicate submission and over-allocation during concurrent requests.
- Finance or administrator roles can review payout requests, but the requester cannot approve
  their own request. Approval records an internal decision only; real provider execution remains
  disabled until the provider and Nigerian operating profile are qualified.
- Refunds, reversals, and disputes hold affected unpaid earnings, flag reserved payout requests
  for review, and require reconciliation after any completed payout rather than silently applying
  an unapproved loss-allocation rule.
- Prototype screens covered by this checkpoint are available at `#/laboratory/settlements`,
  `#/laboratory/payouts`, and `#/admin/settlements`.

## Standards walkthrough

- **Readable and structured:** database, state-machine, authorization, and future
  application/presentation responsibilities are explicit and separated.
- **Security and privacy:** access defaults to deny; only the patient and exact selected
  laboratory receive a home-address snapshot. The ordering practitioner sees the collection
  mode but not the address, and no manager/support shortcut exists.
- **Performance:** patient, practitioner, laboratory queue, request, and status paths
  have bounded composite indexes; completion checks stop after the first matching row. The
  laboratory workspace uses one relational join and one portal-level cache instead of a profile
  request per screen, while notifications retain bounded cursor pagination. Price history uses
  bounded indexed reads, and booking/payment creation is one transaction without per-row lookups.
- **Maintainability:** status names and transition maps are centralized; opaque UUIDs,
  UTC timestamps, and optimistic versions follow platform conventions.
- **Extensibility:** the request references controlled service taxonomy; home addresses use
  ISO two-letter country codes and optional region/postal fields. Prices use supplied ISO 4217
  currency codes and effective dates, and checkout continues through provider adapters. Financial
  reports are bounded to 366 days, use composite organization/currency/status/time indexes, and
  separate currencies rather than performing invalid cross-currency totals. The
  aggregate remains independent of country, currency, payment vendor, or cloud provider.
- **No short-term patching:** invariants are enforced in PostgreSQL as well as domain
  code, history is append-only, and terminal records cannot be silently reopened.
- **Non-standard/open work:** the primary laboratory, patient, and practitioner result
  workflows, embedded result widgets, service catalogue, notification inbox, and profile/settings
  screens now use production boundaries. Laboratory charging now uses the production payment
  boundary. Laboratory settlement reporting and internal payout review now use the production
  organization-finance boundary. Automated payout execution, verified rating/review, billing and team administration,
  query-plan/load, and qualification work remains
  explicitly release-blocking. Home collection is implemented for synthetic review, but real
  operations remain disabled until collection coverage, workforce, transport, consent,
  privacy, and jurisdictional procedures are qualified. No approved screen or navigation
  destination has been removed. Laboratory publication currently permits
  one authorized laboratory member to review and publish; whether Nigerian qualification
  requires independent second-person
  verification is an explicit clinical-governance decision and must not be silently assumed.
  The overdue critical-result worker currently escalates status and repeats the action-required
  alert to the ordering practitioner; selection of any additional qualified on-call escalation
  destination remains a clinical-governance and operational qualification decision.
  The old practitioner screen overwrote the laboratory reviewer field to simulate a general
  "reviewed" receipt. That data-corrupting behavior was not carried forward: critical results
  use the durable acknowledgement aggregate, while ordinary result access remains visible
  and authorization-audited without inventing a clinical acknowledgement record.
