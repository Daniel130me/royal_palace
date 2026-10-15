# Increment 11E — logistics

## Status

**In progress. Synthetic/test data only. No real courier or patient data is enabled.**

This increment replaces the signed logistics prototype with a least-privilege production
aggregate. It preserves the approved dashboard, assignments, delivery detail/progress,
earnings, payout, and history outcomes. It does not reuse the unauthenticated legacy action
routes or expose prescription, medication, clinical-record, or patient-payment data.

## Controlling boundaries

- A logistics delivery is a separate aggregate linked to one pharmacy delivery handoff.
  Pharmacy handoff, dispensing, payment, and logistics state remain independently auditable.
- Only an active, verified logistics organization can receive an assignment. A courier must
  have an active role in that exact organization.
- Patient, pickup-contact, and address snapshots contain only fulfilment data. They are never
  widened into patient records or prescription content.
- Recipient codes are stored only as digests and expire. A delivered transition requires
  immutable proof recorded by an authorized courier.
- Status history and assignment history are durable evidence. Completed, failed, returned,
  and cancelled deliveries cannot be reopened.
- All growing reads will be cursor-bounded and backed by the queue/history indexes introduced
  in this increment.
- Country, currency, vehicle type, provider, and routing assumptions are configuration or data,
  never global hard-coded behavior. Nigeria is the first launch profile, not the domain model.
- Real logistics activation remains disabled until provider, privacy, security, operational,
  regional, and stakeholder qualification is complete.

## Delivery checklist

### 11E1 — delivery integrity foundation

- [x] Add `LOGISTICS` as an organization type without adding it to patient care-facility discovery.
- [x] Add delivery, assignment, append-only status history, and proof-of-delivery records.
- [x] Preserve every client-approved delivery status in an explicit state machine.
- [x] Store immutable minimum-contact/location snapshots and only a recipient-code digest.
- [x] Enforce verified logistics organization scope, exact courier membership, one active
      assignment, legal transitions, terminal integrity, proof-before-delivered, optimistic
      versioning, and append-only evidence in PostgreSQL.
- [x] Add organization/status, worker, courier, order, and history indexes for bounded reads.
- [x] Add default-deny policies for assignment administration, exact-organization fulfilment,
      and patient/pharmacy/logistics/admin delivery visibility. Support and managers receive no
      implicit delivery detail access.
- [x] Add disposable-PostgreSQL clean/upgrade and trigger evidence for verified-organization
      scope, exact courier membership, legal progression, proof-before-delivery, and immutable
      terminal/history/proof state.
- [x] Add assignment concurrency evidence for the one-active-assignment invariant.
- [ ] Add representative logistics query-plan/load evidence before this checkpoint is considered
      production-qualified.

### 11E2 — assignment and operations API

- [x] Add administrator dispatch/create/reassign/cancel use cases with idempotency, audit, and
      optimistic concurrency.
- [x] Add exact logistics-organization queues, courier assignment, accept/progress/fail/return,
      and bounded history APIs.
- [x] Add privacy-minimized patient tracking and pharmacy handoff projections.
- [x] Generate OpenAPI clients and add exact BFF allowlists; no generic resource route may be used.
- [ ] Add field-visibility, authorization, concurrency, replay, and negative-path tests.

### 11E3 — proof and notification

- [ ] Generate recipient codes with qualified entropy, hash with a server-held pepper, deliver only
      through verified-recipient transactional notification, and enforce attempt/rate limits.
- [ ] Complete proof-of-delivery atomically with the delivered transition and append audit evidence.
- [ ] Add privacy-safe status notifications without medicine, prescription, diagnosis, payment,
      or full-address content in external messages.
- [ ] Add failed/returned exception handling and administrator oversight without bypassing the
      delivery state machine.

### 11E4 — signed prototype connection

- [ ] Connect logistics Dashboard at `#/logistics/dashboard`.
- [ ] Connect assignments and history at `#/logistics/assignments` and `#/logistics/history`.
- [ ] Connect delivery detail/progress at `#/logistics/delivery?id=<delivery-id>`.
- [ ] Connect logistics earnings and payout at `#/logistics/earnings` and `#/logistics/payout` using
      immutable organization-finance facts; never infer earnings from browser status.
- [ ] Connect administrator delivery oversight and patient/pharmacy tracking projections.
- [ ] Retire the legacy unauthenticated delivery/progress and logistics payout routes only after
      every approved screen consumes the production boundary.
- [ ] Complete visual/functional comparison against the signed prototype and stakeholder UAT.

## Migration and rollback

Migration `20261015190000_add_logistics_organization_type` commits the additive PostgreSQL enum
value independently because PostgreSQL cannot safely consume a new enum value in the transaction
that introduces it. Migration `20261015200000_logistics_delivery_foundation` is additive and
creates the logistics aggregate and database guards. Application rollback retains all logistics
records and simply ignores the new tables; destructive rollback is forbidden.

## Checkpoint 11E1 implementation report

The production schema now separates delivery operations from pharmacy commerce. A delivery is
anchored to the exact pharmacy order and delivery handoff, while the logistics projection contains
only the minimum pickup/recipient/contact/location facts needed to fulfil it. Assignment and status
evidence are separate append-only records, allowing reassignment and future provider adapters
without rewriting history. Proof is one-to-one, immutable, and required before `DELIVERED`.

The disposable PostgreSQL verifier passes both clean and prior-schema upgrade paths and exercises
rejection of unverified organizations, unrelated couriers, skipped transitions, terminal reopening,
proof mutation, and history deletion, plus the complete successful delivery path.

No signed prototype screen is connected by 11E1; this is the integrity foundation those screens
will consume in 11E2–11E4. The current legacy logistics UI remains visible for prototype comparison
but is not evidence of production connectivity.

## Checkpoint 11E2 implementation report

The production boundary now exposes administrator dispatch/reassignment/cancellation, exact
logistics-organization queues and courier assignment, assigned-courier state progression, bounded
history, patient tracking, and pharmacy handoff tracking. Every mutation is optimistic,
idempotency-scoped to the authenticated principal and operation, and writes business audit evidence
in the same transaction. Courier assignment is append-only: assigning a courier releases the prior
active assignment and creates a new one instead of rewriting history.

The API returns four deliberate projections. Logistics fulfilment receives the minimum contact and
address snapshot required to deliver. Patients receive status, timestamps, locality-level tracking,
and pickup location. Pharmacies receive order/handoff tracking without recipient identity or phone.
Administrators receive organization IDs and locality-level oversight without full contact/address
data. Support and managers remain denied. Couriers may progress only their own active assignments;
cancellation remains an administrator-only operation.

Dispatch now creates an eight-digit recipient code from qualified platform entropy, stores only a
key-versioned HMAC digest, and enqueues a transactional message for the order's patient in the same
transaction. External delivery still uses the existing verified-email-only adapter policy. Code
verification, attempt throttling, proof completion, exception notifications, and replay/concurrency
repository integration tests remain 11E3/11E2 qualification work; real logistics activation remains
disabled.

No signed prototype screen is production-connected by 11E2. The approved logistics routes remain
available for visual comparison at `#/logistics/dashboard`, `#/logistics/assignments`,
`#/logistics/delivery?id=<delivery-id>`, `#/logistics/history`, `#/logistics/earnings`, and
`#/logistics/payouts`; they still use legacy prototype data until 11E4.

Validation at this checkpoint includes the full repository parity/format/lint/type/test/build/schema
gate, 921 passing API tests, 43 passing web tests, 19 passing worker tests, generated-client drift
checking, and disposable-PostgreSQL clean-install/upgrade/backfill/concurrency/constraint evidence.
The additive key-rotation migration was also applied successfully to the local development database.

## Standards walkthrough

- **Readable and maintainable:** delivery, assignment, state history, and proof each have one clear
  responsibility; the TypeScript and PostgreSQL transition maps use the prototype vocabulary.
- **Security first:** codes are digests, clinical/commercial data is excluded, visibility is
  default-deny, courier authority is exact-organization scoped, courier assignment requires an
  organization dispatcher role, external code delivery requires a verified email, and terminal
  states cannot reopen.
- **Performance conscious:** bounded queue/history access has composite indexes; no unbounded or
  N+1 runtime query was introduced by this foundation.
- **Extendable:** organizations, couriers, provider adapters, routing, vehicle metadata, pricing,
  and settlement remain separate concerns. Reassignment keeps immutable history.
- **No magic assumptions:** no currency, country, fee, vehicle, cloud, or payment provider is baked
  into delivery state.
- **Non-standard conditions flagged:** database qualification evidence, API/BFF integration, real
  code verification/rate limiting, representative query-plan evidence, repository replay/concurrency
  integration tests, proof completion, operations telemetry, commercial reporting, visual parity,
  and UAT are still open. Real logistics use remains prohibited.
