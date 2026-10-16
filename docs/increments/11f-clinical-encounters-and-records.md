# Increment 11F — clinical encounters and patient records

## Scope lock

This slice replaces the signed prototype's clinical-record persistence without removing any
approved screen or outcome. It covers the provider encounter workspace, provider patient record,
patient consultation summary, and patient health-record timeline. Prescriptions, laboratory
requests/results, referrals, care plans, and attachments remain visible in those screens and will
be connected through their governed aggregates rather than copied into an encounter JSON blob.

No support, manager, hospital, pharmacy, laboratory, logistics, or finance role receives clinical
record access merely because it can see operational patient data. Administrator access is not an
implicit clinical override. Real clinical use remains disabled until stakeholder clinical/privacy
review and controlled-environment UAT are complete.

## Delivery checklist

### 11F1 — encounter integrity foundation

- [x] Add one appointment-linked encounter with exact patient and independent-practitioner scope.
- [x] Add append-only structured note revisions with one immutable signed base note.
- [x] Add governed diagnoses and structured observations without hard-coded country or units.
- [x] Enforce verified-practitioner ownership, legal state transitions, optimistic versions, and
      immutable signed clinical facts in PostgreSQL.
- [x] Add clean-install, upgrade, rejection, concurrency, immutability, and query-plan evidence.
- [x] Add a domain state machine and tests.

### 11F2 — production encounter API

- [x] Add exact-practitioner start/save/sign/addendum commands with idempotency and audit.
- [x] Add patient-owner and exact-practitioner record reads with bounded stable cursors.
- [x] Keep support projections operational-only and deny managers/organizations by default.
- [x] Add generated OpenAPI contracts and narrowly allowlisted BFF routes.
- [x] Add authorization, replay, concurrency, privacy, validation, and negative-path tests.

### 11F3 — related clinical actions

- [x] Link production prescriptions and laboratory requests to the exact signed/open encounter
      according to their approved workflow rules.
- [x] Implement governed referrals, care plans, allergies, and attachment references as separate
      aggregates with their own authorization and lifecycle evidence.
- [x] Preserve the complete approved provider workspace actions without embedding clinical detail
      in external notifications.

### 11F4 — signed prototype connection

- [x] Connect provider encounter at `#/provider/encounter?id=<encounter-id>`.
- [x] Connect provider patient record at `#/provider/patient?id=<patient-id>`.
- [x] Connect patient health records at `#/patient/records`.
- [x] Connect patient consultation summary at `#/patient/consultation?id=<appointment-id>`.
- [x] Retire the corresponding unauthenticated legacy actions/resources only after parity evidence.
- [ ] Record visual comparison and stakeholder UAT without treating automated checks as approval.

## Architecture rules

- An encounter is created only from a confirmed, patient-owned appointment and is permanently
  scoped to that appointment's patient and practitioner.
- The practitioner is independent of any hospital. Facility affiliation never owns, edits, signs,
  prices, or overrides the practitioner record.
- Every save creates a new note revision. Signed notes, observations, and diagnoses are append-only;
  corrections use signed addenda rather than destructive edits.
- Narrative documentation is structured by versioned schema metadata. Diagnoses and observations
  are normalized so future code systems, units, and features can be added without schema rewrites.
- Patient-owner access and exact treating-practitioner access are distinct from operational patient
  support access. Broader record sharing requires a separately governed consent grant.
- Identifiers are UUIDv7, timestamps are UTC instants, and all lists are cursor-bounded and indexed.
- Clinical content never appears in external notification bodies, logs, analytics payloads, or
  manager/organization projections.

## 11F1 qualification evidence

- Prisma schema validation and schema-drift comparison passed.
- The migration harness passed clean installation, prior-schema upgrade, forward-only repair,
  transactionality, exact appointment/practitioner scope, invalid-actor rejection, immutable
  signed data, signed addenda, and concurrent note-revision rejection.
- The complete API test run passed with 933 tests passing and one intentional skip, including the
  clinical encounter state-machine tests.
- PostgreSQL demonstrated the patient and practitioner cursor indexes for the bounded production
  query shapes. Because this foundation intentionally does not seed clinical records into normal
  test environments, these two results are index-eligibility proofs rather than inflated synthetic
  latency claims; representative-scale API query measurements will be recorded in 11F2.

## 11F2 qualification evidence

- The API exposes only appointment-linked open, append-only draft, sign, addendum, and bounded read
  operations. Each write has a principal-scoped idempotency record, a canonical request hash,
  serializable transaction handling, optimistic revision/version checks, and a content-free audit
  event.
- Clinical authorization policy version 27 grants full access only to the encounter's exact
  verified practitioner and signed-record access only to the patient owner. Support,
  administrators, managers, unrelated practitioners, and organization memberships receive no
  clinical-content access. Authorization is evaluated from relationship metadata before narrative
  content is loaded; patient queries do not select draft notes.
- Request validation is strict and bounded: schema version 1, structured sections, matched
  diagnosis code systems, discriminated observation values, item limits, exact UUIDs, and safe
  idempotency keys. Clinical mode remains synthetic-only and fails closed elsewhere.
- Generated OpenAPI types and explicit provider/patient BFF allowlists cover the seven new API
  operations without accepting arbitrary path suffixes or query parameters.
- The clinical authorization, service, controller-validation, and route-policy suite passes 751
  checks. The full migration verifier passes clean install, upgrade, repair, clinical invariants,
  rejection, and concurrency checks.
- PostgreSQL representative query review demonstrates the intended patient and practitioner cursor
  indexes. The test fixture intentionally contains no synthetic clinical records, so the measured
  0.034 ms patient and 0.088 ms practitioner executions are index-eligibility evidence rather than
  production latency claims.

## 11F3–11F4 implementation evidence

- Prescriptions and laboratory requests resolve their encounter from the exact appointment,
  patient, and practitioner tuple. PostgreSQL rejects cross-patient, cross-practitioner, and
  non-open/non-signed links even if an application defect reaches the database.
- Referrals, care plans, allergies, and attachment references are normalized clinical aggregates,
  not mutable fields inside a note JSON document. Writes require the exact verified practitioner,
  principal-scoped idempotency, a serializable transaction, and a content-free audit event.
- Attachment references accept only an already clean laboratory attachment, clean scanned
  prescription, or clean onboarding document owned by the encounter patient. The prototype's
  random fake-attachment behavior is retired.
- The provider encounter, provider patient record, patient health-record timeline, patient
  consultation summary, and provider dashboard now read/write through the typed production
  clinical API. Signed-record patient reads exclude drafts. Consultation lookup uses the exact
  patient-and-appointment index path instead of scanning a bounded encounter page.
- Legacy SQLite encounter, diagnosis, and care-plan resources and the legacy start/sign actions
  return `410 Gone`. This explicit tombstone prevents stale clients from silently writing clinical
  facts into the retired store; the separate legacy referral inbox remains visible until its
  recipient workflow receives its own production lifecycle slice.
- No real clinical mode, external notification content, production terminology, retention rule,
  or emergency-access policy was activated by this increment.
- Final combined-batch verification passed: 8/8 workspace type-check and lint tasks, 953 API tests
  with one intentional skip, 44/44 web tests, 8/8 production builds with 57 static pages,
  139-capability prototype-parity verification, Prisma validation, and the complete PostgreSQL
  clean-install/upgrade/backfill/repair/concurrency/constraint migration harness.

## Rollback and qualification

Migrations are additive and forward-only. Application rollback leaves clinical records intact and
stops serving the new routes; destructive rollback is forbidden. A repair migration must be used
for any published-schema correction. Clinical/privacy review, visual UAT, retention rules,
break-glass policy, terminology qualification, and production operations remain explicit launch
gates rather than assumptions in code.
