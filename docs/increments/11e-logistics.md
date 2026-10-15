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
- [x] Add representative logistics query-plan/load evidence before this checkpoint is considered
      production-qualified.

### 11E2 — assignment and operations API

- [x] Add administrator dispatch/create/reassign/cancel use cases with idempotency, audit, and
      optimistic concurrency.
- [x] Add exact logistics-organization queues, courier assignment, accept/progress/fail/return,
      and bounded history APIs.
- [x] Add privacy-minimized patient tracking and pharmacy handoff projections.
- [x] Generate OpenAPI clients and add exact BFF allowlists; no generic resource route may be used.
- [x] Add field-visibility, authorization, concurrency, replay, and negative-path tests.

### 11E3 — proof and notification

- [x] Generate recipient codes with qualified entropy, hash with a server-held pepper, deliver only
      through verified-recipient transactional notification, and enforce attempt/rate limits.
- [x] Complete proof-of-delivery atomically with the delivered transition and append audit evidence.
- [x] Add privacy-safe status notifications without medicine, prescription, diagnosis, payment,
      or full-address content in external messages.
- [x] Add failed/returned exception handling and administrator oversight without bypassing the
      delivery state machine.

### 11E4 — signed prototype connection

- [x] Connect logistics Dashboard at `#/logistics/dashboard`.
- [x] Connect assignments and history at `#/logistics/assignments` and `#/logistics/history`.
- [x] Connect delivery detail/progress at `#/logistics/delivery?id=<delivery-id>`.
- [x] Connect logistics earnings and payout at `#/logistics/earnings` and `#/logistics/payouts` using
      immutable organization-finance facts; never infer earnings from browser status.
- [x] Connect administrator delivery oversight and patient/pharmacy tracking projections.
- [x] Retire the legacy unauthenticated delivery/progress and logistics payout routes only after
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
  provider qualification, representative query-plan evidence, deeper repository replay/concurrency
  integration tests, operations telemetry, commercial reporting, visual parity, and UAT are still
  open. Real logistics use remains prohibited.

## Checkpoint 11E3 implementation report

Recipient-code verification is now an exact-organization, assigned-courier operation. The stored
key identifier selects the correct server-held HMAC key, supplied codes are compared in constant
time, and no plaintext code or digest is written to audit data. A bounded one-to-one challenge
record tracks the configurable attempt window, maximum failures, temporary lock, and successful
verification. Locking the delivery row serializes concurrent attempts without an unbounded attempt
table or a process-local rate limiter.

Successful verification atomically marks the challenge verified, inserts immutable proof, moves
the delivery from `ARRIVED_AT_DESTINATION` to `DELIVERED`, appends status history, records audit
evidence, and enqueues patient and pharmacy notifications. PostgreSQL independently requires the
challenge verification timestamp to match the immutable proof. Failed, returned, and cancelled
updates use the same state machine. Administrators can filter exception statuses and read bounded
immutable history, including reason codes, without receiving full recipient or address data.

External messages contain only a delivery reference and a sign-in instruction; they exclude
medicine, prescription, diagnosis, payment, amount, patient identity, phone, and address details.
The existing notification worker still permits external email only for verified recipients and
keeps real adapters disabled until provider and regional qualification.

No signed prototype screen is newly connected by 11E3. The approved logistics screens remain
available for visual comparison at `#/logistics/dashboard`, `#/logistics/assignments`,
`#/logistics/delivery?id=<delivery-id>`, `#/logistics/history`, `#/logistics/earnings`, and
`#/logistics/payouts`; production UI wiring remains 11E4.

Validation includes 139 approved prototype capabilities, 925 passing API tests, 43 passing web
tests, 20 passing worker tests, generated-client drift checking, full formatting/lint/type/build
gates, Prisma validation, and disposable-PostgreSQL clean-install, upgrade, backfill, concurrency,
immutability, and constraint evidence. Migration
`20261015220000_logistics_recipient_code_attempt_policy` is also applied to the local development
database.

## Checkpoint 11E4 implementation report

Every signed logistics screen now consumes the authenticated production boundary. Dashboard,
assignments, history, and delivery detail use exact-organization, cursor-bounded delivery
projections. Delivery progress sends the server-owned expected version and a unique idempotency key;
recipient proof accepts exactly eight digits and never displays, stores, or reconstructs the
plaintext code in the browser. The misleading prototype-only four-hour ETA and browser-calculated
per-delivery payout fields have been removed without removing their approved outcomes: the workflow
timeline remains, while earnings and payouts now come exclusively from organization-finance facts.

Earnings supports daily, monthly, and custom-range reports with a maximum 366-day query window and
keeps currencies separate. Payout requests reserve only server-confirmed available balances and
remain internal finance decisions until a transfer provider and launch region are qualified. The
finance OpenAPI contract now includes logistics organizations instead of coercing them into a care
facility type.

Administrator delivery oversight uses the minimized administrator projection and never receives
recipient identity, phone, full address, verification code, or patient payment data. Pharmacy
delivery screens join their existing handoff view to the minimized pharmacy tracking projection by
handoff reference. A patient order displays its own minimized tracking projection only when its
delivery handoff reference matches. The legacy generic delivery collection, unauthenticated
delivery-progress action, and logistics branch of the legacy payout action are no longer exposed.

Synthetic development seeding now creates a verified logistics organization, an exact organization
membership for the synthetic logistics reviewer, and one internally consistent synthetic pharmacy
order/handoff/delivery aggregate for browser review. It is still guarded by the existing
non-production and loopback-issuer checks; no real provider, courier, patient, or delivery data is
enabled.

Validation at this checkpoint includes generated-client drift checking, web lint and type checking,
43 passing web tests, the optimized production web build, and the executable parity register: 139
approved capabilities across 11 portals, 16 visual references, and 138 historical artifacts. The
browser-control surface rejected local-loopback inspection in this session, so visual comparison
and stakeholder UAT intentionally remain open rather than being claimed without evidence.

### 11E4 standards walkthrough

- **Readable and maintainable:** generated logistics contracts feed a dedicated service boundary,
  shared domain types, and small screen adapters; browser components do not construct raw API calls.
- **Security first:** exact organization headers, CSRF, idempotency, optimistic versions, bounded
  projections, and one-way recipient proof replace the unauthenticated legacy workflow.
- **Performance conscious:** delivery reads are capped at 50 records per cursor page, history is
  bounded, screens expose deliberate load-more controls, and patient/pharmacy joins are in-memory
  joins over two bounded calls rather than N+1 requests.
- **Extendable:** status, address, currency, finance, organization, and payout contracts remain
  vendor-neutral and contain no Nigeria-only, provider-specific, vehicle, SLA, or currency default.
- **No magic assumptions:** the browser no longer invents ETA or payout values; date-range limits
  mirror the server contract and currencies come from finance facts.
- **Non-standard conditions flagged:** stakeholder visual/UAT approval, governed commercial policy,
  and real logistics/payment provider qualification remain open. Real logistics activation remains
  prohibited.

## Technical qualification follow-through

The shared PostgreSQL performance harness now creates 5,000 complete synthetic logistics
workflows, including the direct-OTC quote, reservation, confirmed order, successful synthetic
payment, delivery handoff, delivery, assignment, initial history, and recipient challenge. It checks
the exact organization/status queue, administrator/status queue, and per-delivery history indexes.
These rows exist only inside the verifier transaction and are rolled back after `EXPLAIN (ANALYZE,
BUFFERS)`; they never become development or production records.

Native PostgreSQL 18 and protected CI PostgreSQL 17.6 both observed
`logistics_deliveries_org_status_assigned_idx`, `logistics_deliveries_status_assigned_idx`, and
`logistics_delivery_history_delivery_time_idx` for the intended queue/history reads. The published
recipient-challenge migration was preserved; a forward-only corrective migration aligns its
`updated_at` ownership and foreign-key action with Prisma. Clean install, prior-schema upgrade,
constraint, idempotent-seed, zero-drift, and representative-plan gates all pass.

The API suite now proves completed dispatch replay without duplicate delivery or notification
writes, rejects an idempotency-key/hash mismatch, stops unauthorized reads before repository
access, rejects malformed cursors before queries execute, preserves exact-organization hiding, and
keeps recipient identity and full addresses out of administrator projections. Existing disposable
PostgreSQL evidence continues to cover assignment concurrency, illegal transitions, terminal
reopening, proof/history immutability, and exact courier membership.

The guarded development seed adds one browser-review delivery with ID
`0199a18e-a400-7000-8000-000000000822`. Its recipient code is printed only by the local synthetic
seed process and is HMAC-digested with the configured local key before storage. The complete fixture
is written atomically, so a failed seed cannot leave a partial commercial or logistics aggregate.
It remains impossible to run this seed in production.

### Browser review

After the local services are running and the synthetic seed has completed, sign in as the logistics
reviewer and open:

- `http://127.0.0.1:3100/#/logistics/dashboard`
- `http://127.0.0.1:3100/#/logistics/assignments`
- `http://127.0.0.1:3100/#/logistics/delivery?id=0199a18e-a400-7000-8000-000000000822`
- `http://127.0.0.1:3100/#/logistics/history`

The same synthetic aggregate is visible through the privacy-minimized administrator, pharmacy, and
patient screens where their own projections apply. Earnings and payouts intentionally remain based
on immutable finance facts; the seed does not invent logistics commercial terms.

### Qualification standards walkthrough

- **Readable and maintainable:** the browser fixture follows the same quote → order → handoff →
  delivery aggregate boundaries as runtime code, while replay coverage targets the repository
  boundary that owns idempotency.
- **Security first:** the seed remains environment-guarded, recipient proof is stored only as a
  key-versioned HMAC digest, denied requests stop before data access, and minimized projections are
  asserted explicitly.
- **Performance conscious:** 5,000 full workflows exercise the real composite queue/history indexes;
  no unbounded read or per-row application follow-up query was added.
- **Extendable:** the evidence is organized around organization, status, cursor, and history
  contracts without selecting a courier vendor, routing engine, cloud, country, or payment gateway.
- **No magic production assumptions:** CAD/USD values and Canadian addresses are scoped only to
  synthetic fixtures; they are not defaults or commercial rules. Logistics earnings remain empty
  until governed commercial policy creates finance facts.
- **Non-standard conditions flagged:** stakeholder visual parity/UAT, governed logistics commercial
  policy, provider qualification, and real activation remain open. No technical qualification is
  being claimed as authorization for real logistics use.
