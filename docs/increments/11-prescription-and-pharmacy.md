# Increment 11 — prescription and pharmacy

## Status

**In progress. Not approved for real clinical use.** The product owner approved the
prescription and pharmacy rules on 2026-10-07. Checkpoints 11A and 11B establish the
production prescription aggregate, patient-directed pharmacy routing, consented
substitution, and immutable dispensing/refill accounting in the synthetic local/test
environment. Commercial orders, frontend migration, and qualified jurisdiction
activation remain open. `CLINICAL_WORKFLOW_MODE` defaults to `disabled`, and
staging/production reject every non-disabled value until clinical and legal
qualification is completed.

## Approved controlling rules

- Only an independently verified, authenticated practitioner may create and attest a
  prescription.
- The lifecycle is `DRAFT → SIGNED → SENT → ACCEPTED → PARTIALLY_DISPENSED →
DISPENSED`, with `CANCELLED` and `EXPIRED` terminal paths.
- The patient selects the pharmacy that receives a signed prescription.
- Pharmacy staff cannot silently change a prescription. Substitution must later use
  explicit patient consent and practitioner approval where policy requires it.
- Signed content is immutable. A correction creates a separately signed prescription
  that references the prior prescription.
- Quantity, validity, refills, cancellation, and every state transition are explicit
  clinical facts.
- Controlled-medication prescribing is disabled until separately qualified for each
  jurisdiction.
- A pharmacy sees only the information needed for its routed prescription. Managers
  receive no prescription or clinical access. Support receives no prescription access
  in this checkpoint.
- Real clinical use remains disabled until qualified clinical, privacy, and legal
  reviewers approve the workflow in each launch jurisdiction.

## Delivery checklist

### 11A — prescription issuance and pharmacy-routing foundation

- [x] Add a dedicated Nest `pharmacy` module with explicit domain, application,
      persistence, and presentation boundaries; do not reuse prototype generic CRUD.
- [x] Add PostgreSQL prescription, item, route, and append-only status-history models.
- [x] Enforce the approved state machine, signed-content immutability, amendment
      ownership, one active route, verified-pharmacy routing, and controlled-medication
      denial in both application and database boundaries.
- [x] Require verified practitioner ownership and recent step-up authentication before
      signing; require a confirmed/completed appointment for the same patient and
      practitioner; derive actor authority from the authenticated session and
      production records rather than request-supplied actor IDs.
- [x] Allow only the owning patient to route a signed prescription and only members of
      the selected pharmacy to view/accept it. Exclude managers and support.
- [x] Suppress consultation linkage and private clinical notes from pharmacy responses.
- [x] Add optimistic concurrency, cursor pagination, bounded expiry leasing, and
      indexes for patient, practitioner, pharmacy-queue, and expiry access paths.
- [x] Validate clean migration, prior-schema upgrade, transactional repair, constraints,
      signing immutability, concurrent acceptance, expiry, and a representative
      5,000-route indexed queue plan.
- [x] Keep the workflow synthetic-only and fail closed in protected environments.
- [x] Publish the direct service OpenAPI contract, generated TypeScript types, and
      deterministic contract-drift check. Browser/BFF exposure remains deferred to 11C.
- [x] Connect the frontend and retire the corresponding prototype issue/upload/order
      routes only after the complete pharmacy slice is available.

### 11B — dispensing, substitution, and refill accounting

- [x] Add immutable dispense events and per-item quantity/refill balances; never infer
      dispensing from an order status.
- [x] Add substitution proposals, explicit patient consent, jurisdiction policy hooks,
      and practitioner approval where required.
- [x] Add partial-dispense, completion, rejection/return-to-patient, cancellation, and
      expiry concurrency tests.
- [x] Add purpose-minimized transactional notifications without clinical details.

### 11C — pharmacy commercial and operational workflow

- [x] **11C1 — shared payment subject foundation:** generalize the existing payment,
      checkout, webhook, ledger, and reconciliation boundary from appointment-only
      ownership to an explicit payable subject without changing appointment behavior.
- [x] **11C2 — quote, reservation, and order core:** add immutable prescription-fill
      quotes, inventory reservation ports, patient acceptance, and pharmacy orders.
      Inventory remains operational evidence and never becomes the clinical source of
      truth.
- [x] **11C3 — payment and fulfilment orchestration:** connect successful, reversed,
      disputed, and refunded payment facts to the order state machine; keep dispensing
      independent; add pickup/delivery handoff without implementing logistics itself.
- [x] **11C4 — browser cutover and prototype retirement:** replace prototype pharmacy
      pages and action routes with generated contracts and exact authenticated BFF
      allowlists; delete generic prescription/order CRUD exposure after parity tests.
- [ ] **11C5 — qualification evidence:** complete financial/clinical-owner review and
      keep real inventory, payment, and clinical activation disabled until every
      provider and jurisdiction gate is approved.

The product owner approved the commercial rules on 2026-10-07: pharmacy-issued
time-limited quotes; immutable line/tax/fee/currency snapshots; explicit patient
acceptance and hosted checkout; payment and clinical dispensing as independent facts;
pre-dispense refund initiation with post-dispense administrative disputes; a
vendor-neutral inventory adapter; OTC deferral; and separate settlement/commission
consumers. No production provider, tax policy, settlement policy, or jurisdiction is
activated by this approval.

## Database and recovery

Migration `20261007120000_prescription_pharmacy_foundation` is additive and
forward-only. Deploy it before API binaries. If the checkpoint must be disabled, set
`CLINICAL_WORKFLOW_MODE=disabled` and restore the prior API binary; retain all
prescription and history rows. Never roll back by deleting signed prescriptions or
their history. Before any real-data deployment, take and verify a backup, rehearse the
forward migration and application rollback against a representative copy, and obtain
the required clinical/privacy approvals.

## Standards walkthrough

- **Readable and structured:** domain state rules, application authorization,
  persistence, HTTP validation, and contracts have separate owners. Non-obvious
  immutability and privacy decisions are documented at their boundaries.
- **Security and privacy:** the module is default-disabled, protected environments
  fail closed, signing requires verified practitioner ownership plus step-up, pharmacy
  access requires exact organization membership, and manager/support access is denied.
- **Data integrity:** signed content and items are immutable, clinical history is
  append-only, transitions are guarded in PostgreSQL, amendments preserve provenance,
  and concurrent mutations use row locks and optimistic versions.
- **Performance:** growing lists are cursor-paginated and selected by composite indexes;
  expiry is bounded with `FOR UPDATE SKIP LOCKED`; the representative pharmacy queue
  used `prescription_routes_pharmacy_queue_idx` across 5,000 routes.
- **Global extensibility:** jurisdiction is explicit governed data; no country,
  currency, terminology system, medication code, pharmacy, or cloud vendor is fixed in
  reusable logic. Controlled-medication policy remains a visible jurisdiction gate.
- **No hidden patching:** the unauthenticated prototype routes remain quarantined and
  are explicitly scheduled for retirement after frontend cutover. This checkpoint
  does not falsely label them production-ready or bridge them into the new database.

## Checkpoint 11A completion report

### Increment and scope

Checkpoint 11A is complete at the code and synthetic-verification boundary. It delivers
prescription creation, revision, signing, authorized reading, patient-selected verified
pharmacy routing, pharmacy acceptance, practitioner cancellation, and bounded expiry.
It does not deliver dispensing, substitution, refill consumption, commercial orders,
frontend/BFF cutover, or real clinical activation.

### Architecture and changed surfaces

- `apps/api/src/pharmacy` owns the prescription domain state machine, application
  authorization/orchestration, Prisma repository, and transport validation.
- `apps/api/prisma/schema.prisma` and migration
  `20261007120000_prescription_pharmacy_foundation` own the durable prescription,
  item, route, and append-only status-history data.
- `packages/contracts` owns shared role-minimized responses; `packages/api-client`
  owns the direct `/v1` OpenAPI contract, generated types, and stale-generation gate.
- `packages/config` owns `CLINICAL_WORKFLOW_MODE`; it defaults to `disabled`, accepts
  `synthetic` only outside protected environments, and rejects real activation.
- The authorization policy version is 8. Managers and support have no prescription
  policy. The patient, issuing practitioner, selected verified pharmacy membership,
  and system-worker expiry paths are independently constrained.

No new ADR was required: this checkpoint follows the existing modular-monolith,
vendor-neutral, global-deployability, PostgreSQL, and environment-isolation decisions.

### Database migration and data integrity

The additive forward migration creates normalized aggregates, named foreign keys,
checks, partial/composite indexes, and database triggers. PostgreSQL independently
enforces legal state transitions, signed-content and signed-item immutability,
append-only history, one active pharmacy route, a verified active pharmacy target,
appointment/patient/practitioner consistency, amendment ownership, and the current
controlled-medication prohibition. The application uses optimistic versions and row
locks; concurrent pharmacy acceptance has one winner.

Deploy the migration before the API binary. Disable the feature by setting
`CLINICAL_WORKFLOW_MODE=disabled`; if an application rollback is required, restore the
prior binary and retain every prescription/history row. Never down-migrate by deleting
signed clinical data. Real-data deployment additionally requires a verified backup,
migration rehearsal, restoration rehearsal, retention/legal-hold policy, and clinical,
privacy, security, and jurisdiction approvals.

### API, authorization, and privacy behavior

The direct service contract covers provider draft/sign/cancel, authorized read,
patient routing, pharmacy queue/acceptance, and internal expiry. All inputs are strict
and bounded. Browser access is intentionally not exposed until exact authenticated BFF
allowlists and frontend flows land in 11C.

Internal patient/practitioner principal IDs never cross the response boundary.
Pharmacy responses omit both the consultation appointment linkage and private clinical
note rather than returning them as nullable fields. Pharmacy queue access requires the
authenticated `x-organization-id` context and exact active membership. Prescription
creation requires a confirmed/completed appointment for the same patient and
practitioner, which prevents a verified practitioner from targeting an unrelated
patient. Signing additionally requires recent privileged assurance and a verified
practitioner record. Controlled medications fail closed.

### Query and performance evidence

All growing lists use bounded cursor pagination. The pharmacy queue uses a composite
organization/status/sent-time index and fetches at most `limit + 1` rows. Expiry leases
at most 100 due rows with `FOR UPDATE SKIP LOCKED`, allowing safe worker concurrency.
The synthetic verifier exercised 5,000 routed prescriptions and observed the natural
indexed queue query at 0.228 ms in the disposable local PostgreSQL database. This is
index-plan evidence, not a production latency guarantee; production SLO/load evidence
remains required before launch.

### Verification evidence

- Prisma generation and both API/web schema validation passed.
- Migration verification passed all 13 migrations for a clean database, prior-schema
  upgrade, transactional repair, and constraints.
- Prescription persistence verification passed missing-appointment rejection, signed
  item immutability, append-only history, patient routing, concurrent acceptance,
  bounded expiry, and the representative 5,000-route query.
- Recursive lint and TypeScript/generated-contract checks passed for all workspaces.
- Recursive tests passed: config 18, security 10, API client 1, API 403 with 1
  environment-dependent integration test skipped, worker 15 with 9
  environment-dependent integration tests skipped, and web 33.
- Recursive production builds passed for shared packages, API, worker, and the 64-page
  Next.js build; format and generated-client drift checks passed.
- `pnpm audit --prod --audit-level high` reported no known production vulnerabilities.
  The full dependency graph contains one unfixed development-only Next.js ESLint
  transitive advisory. Its exact scope, threat analysis, review deadline, and strict CI
  enforcement are recorded in `docs/security/dependency-exceptions.md`.
- A tracked-source credential-pattern scan passed. Gitleaks is not installed locally;
  the pinned remote CI action remains the authoritative full-history secret scan.
- The PostgreSQL CI job builds the API's transitive workspace runtime dependencies
  before executing standalone TypeScript verifiers. The dependency-derived package
  selection prevents clean runners from relying on untracked local `dist` output and
  automatically includes future internal runtime dependencies.

The non-standard local verification constraint is Windows Application Control blocking
Turbo/Vite native subprocesses inside the restricted sandbox. The equivalent recursive
workspace commands were run outside that restriction; remote Linux CI must still pass
the canonical `pnpm verify`, audit policy, Gitleaks, PostgreSQL, and exact clean-tree
gates before this checkpoint is treated as remotely integrated.

The PostgreSQL JavaScript driver is explicitly pinned to the supported `8.16.3` release.
Newer 8.x releases expose an unresolved Prisma `adapter-pg` transaction-query warning
that upstream tracks as a future `pg@9` compatibility defect. Prescription relation
hydration uses a single PostgreSQL join outside mutation transactions to minimize lock
duration and avoid application-created concurrent queries on a transaction client. The
pin must be re-evaluated with the Prisma adapter before any PostgreSQL driver upgrade.

### Observability and operational follow-up

Every protected authorization decision uses the existing immutable authorization-audit
boundary and request correlation ID. State history preserves actor, reason, previous
state, next state, and occurrence time without logging prescription payloads. Before
real activation, add clinical workflow dashboards and alerts for denied access,
conflicts, expiry backlog, queue age, and delivery failures without clinical text or
patient identifiers in metrics/logs.

### Known limitations and next checkpoint

Checkpoint 11A is synthetic-only and not a complete pharmacy product. The old prototype
issue/upload/order routes still appear in the Next.js route inventory but are not
bridged into this aggregate and fail closed in protected environments under the existing
prototype quarantine. Checkpoint 11B is next: immutable dispense events, substitution
consent/approval, quantity and refill accounting, cancellation/return edge cases, and
privacy-safe notification intents. Checkpoint 11C then adds the commercial workflow,
frontend/BFF cutover, and deletion of the replaced prototype paths.

### Required gate

No new product decision is requested for 11A. Remote CI success on the exact pushed
commit is required before starting 11B. Real clinical use remains prohibited until the
material jurisdiction, clinical, privacy, retention, terminology, and operational
qualification decisions in the controlling plan are completed.

## Checkpoint 11B completion report

### Increment and scope

Checkpoint 11B is complete at the code and synthetic-verification boundary. It adds
per-item/fill substitution proposals, immutable patient and practitioner decisions,
immutable dispense events, quantity/refill balances, patient rerouting before any
dispense fact exists, and privacy-safe notification intents. It does not add pharmacy
inventory, quotes, reservations, orders, payments, fulfilment, browser/BFF exposure,
or real clinical activation; those boundaries remain in 11C and qualification.

### Architecture and integrity

- Additive migration `20261007160000_prescription_dispensing_and_substitution` owns
  temporal jurisdiction policy versions, proposals, decisions, dispense events,
  dispense lines, constraints, indexes, and database triggers. Signed prescription
  content remains immutable.
- A missing, disabled, expired, or future jurisdiction policy rejects substitution.
  Effective windows cannot overlap. Each proposal references the exact governing
  policy version and snapshots its mode. `PATIENT_ONLY` requires patient consent;
  `PATIENT_AND_PRACTITIONER` requires patient consent followed by the independently
  verified issuing practitioner's step-up-authorized approval.
- Every decision, dispense event, and dispense line is append-only. A caller-supplied
  event UUID plus a server-generated canonical SHA-256 request digest makes dispense
  retries idempotent and rejects reuse with different content.
- Each dispense line is tied to one prescribed item and zero-based fill number. The
  database prevents skipped refills, per-fill over-dispensing, unauthorized medication
  identity changes, and use of an unapproved substitution. Medication identity is
  derived server-side from the prescription or approved proposal, never trusted from
  the pharmacy request.
- A pharmacy may return an undispensed `SENT` or `ACCEPTED` prescription to `SIGNED`
  with a controlled reason so the patient can reroute it. Once any dispense event
  exists, return-to-patient is rejected. Practitioner cancellation remains legal after
  a partial dispense but optimistic versioning gives concurrent cancellation,
  dispensing, return, and expiry operations a consistent serialized outcome.

### Security, privacy, and performance

Patient consent is authorized against the prescription owner; practitioner approval is
authorized against the issuing verified practitioner with recent privileged assurance;
and proposal, dispense, and return operations require active membership in the selected
pharmacy. Manager and support roles remain excluded. Pharmacy responses still omit the
appointment link and private clinical note.

External email intents use only the prescription reference and generic action/update
language. They include no medicine, dose, diagnosis, pharmacy, decision outcome, or
other clinical content; delivery still requires a verified recipient under the
existing notification boundary and real providers remain disabled.

Prescription reads aggregate all item/fill balances in one grouped query. Pharmacy
queue reads aggregate balances for the entire bounded page in one query, avoiding an
item or prescription N+1. Dispense-time items and substitution proposals are loaded in
bounded batch queries, and transaction-client reads are sequential to respect the
supported Prisma PostgreSQL adapter behavior. Embedded substitution proposals are
limited to the at-most-one actionable proposal per item/current fill; immutable
historical proposal facts remain retained in PostgreSQL. Dispense history is
independently cursor-paginated and uses the prescription/occurred-time index.

### Verification evidence

- The 11A integration correction passed all exact-head remote jobs on commit
  `947642c`: canonical install/verify/audit, full-history secret scan, and PostgreSQL
  migrations/query plans/persistence.
- Prisma generation and validation passed. The migration verifier passed all 14
  migrations for clean install, prior-schema upgrade, transactional repair, and
  constraint checks.
- The PostgreSQL prescription verifier passed signed-content immutability, substitution
  consent and approval, non-overlapping temporal policy windows, unchanged-medication
  rejection, append-only decisions/events, concurrent payload-bound idempotent retry,
  partial and complete dispensing, proposal/dispense refill ordering and balances,
  safe return/rerouting, cancellation/dispense and expiry/dispense concurrency, bounded
  expiry, and the representative 5,000-route indexed query (0.450 ms observed locally).
- Focused API tests passed 405 active tests with one environment-dependent integration
  test skipped. Worker tests passed 16 active tests with nine environment-dependent
  integration tests skipped, including explicit checks that prescription templates do
  not contain common clinical terms.
- The OpenAPI contract is version 1.1.0, generated TypeScript is drift-checked, and the
  existing cursor-page and expiry-response schemas were corrected while extending it.

### Standards walkthrough

- **Readable and extendable:** domain inputs, application authorization, repository
  transactions, database invariants, transport validation, contracts, and templates
  remain separate. Jurisdiction behavior is governed data rather than country logic.
- **Security first:** identity is derived from the authenticated session, role and
  organization scope are re-authorized, medication snapshots are server-derived, and
  production clinical mode still fails closed.
- **Query conscious:** no per-item balance query and no per-line substitution lookup;
  all growing event history is bounded and indexed.
- **No short-term patching:** dispensing is an independent immutable clinical fact
  model, not a flag on the future commercial order. The old prototype routes remain
  quarantined until the deliberate 11C cutover and deletion.
- **Known non-standard boundary:** jurisdiction policies have no production admin
  interface yet and must not be manipulated manually outside disposable synthetic
  verification. The governed admin workflow and qualified policy content are required
  before real activation.

### Next checkpoint and gate

Checkpoint 11C is next: inventory-facing quote/reservation boundaries, provider-neutral
pharmacy order/payment/fulfilment states, exact BFF/frontend cutover, and deletion of
the replaced prototype paths. Real clinical activation remains prohibited pending the
qualified jurisdiction, clinical, privacy, retention, terminology, security, and
operational approvals already recorded in the controlling plan.

## Checkpoint 11C1 completion report

### Increment and scope

Checkpoint 11C1 is complete. Payments now carry an explicit immutable purpose and an
independent immutable payable deadline. Existing appointment payments are backfilled as
`CONSULTATION`, preserve their appointment foreign key and behavior, and expose the new
facts through the shared contract. This checkpoint does not create pharmacy quotes,
orders, inventory reservations, refunds, fulfilment, settlement, or production provider
activation; those remain in 11C2–11C5.

### Architecture and integrity

- Migration `20261007190000_payment_subject_foundation` adds the controlled
  `PaymentPurpose` enum, backfills `payable_until` from the appointment commercial
  snapshot, makes both facts part of immutable payment identity, and adds a bounded
  purpose/status/deadline index for future operational workers.
- Checkout validity reads the payment-owned deadline rather than reaching through the
  appointment aggregate. Webhook state effects dispatch through an explicit payment
  purpose boundary; unsupported subjects fail closed instead of receiving appointment
  behavior accidentally.
- Appointment remains a real foreign key. The foundation deliberately avoids an
  unvalidated polymorphic `subject_id`; 11C2 will add a pharmacy-order foreign key and
  an exactly-one-subject constraint when that aggregate exists.
- Ledger entries, provider evidence, reconciliation, and checkout sessions remain
  payment-owned. Clinical dispensing remains a separate immutable fact and is not
  inferred from payment state.

### Verification evidence

- Prisma generation/schema validation, API and generated-client type checks, generated
  contract drift, lint, and all 405 active API tests passed; one environment-dependent
  integration test remained skipped as before.
- All 15 migrations passed clean installation, foundation-to-current upgrade,
  transactional repair, constraints, and concurrent booking.
- A dedicated previous-schema rehearsal inserted an appointment payment before 11C1,
  applied the migration, and proved that appointment identity, `CONSULTATION` purpose,
  and the exact payable timestamp were preserved.
- The scheduling/payment PostgreSQL verifier passed immutable purpose/deadline,
  checkout, authenticated webhook persistence, duplicate and out-of-order delivery,
  partial/final refund accounting, balanced ledger entries, settled-activity
  idempotency, reconciliation, and reservation expiry. Schema drift was zero.

### Standards walkthrough

- **Readable and extendable:** payment purpose and payable period are explicit domain
  facts; subject-specific effects are isolated behind one dispatch point.
- **Security and integrity:** subject, owner, amount, currency, and payable deadline are
  database-immutable, provider validation is unchanged, and unknown future purposes
  fail closed.
- **Query conscious:** checkout removes an unnecessary appointment join, and the new
  composite index supports bounded purpose/status/deadline scans without country,
  currency, provider, or cloud assumptions.
- **No short-term patching:** relational subject integrity is retained. The temporary
  current-subject constraint permits only consultation payments and must be replaced
  atomically by 11C2's exactly-one appointment-or-pharmacy-order constraint; it is not
  a production workaround.

### Next checkpoint

11C2 adds immutable prescription-fill quotes, line/tax/fee snapshots, vendor-neutral
inventory reservation evidence, explicit patient acceptance, and pharmacy orders. Real
inventory/payment adapters and every jurisdiction remain disabled pending the recorded
qualification decisions.

## Checkpoint 11C2 completion report

### Increment and scope

Checkpoint 11C2 is complete. A verified pharmacy member can create a time-limited quote
for an eligible routed prescription fill, and only the owning patient can accept it.
Acceptance atomically creates a pharmacy order and its `PHARMACY_ORDER` payment. This
checkpoint does not infer dispensing from payment, execute fulfilment, expose the new
flow in the browser, calculate jurisdictional tax, or enable a real inventory/payment
provider; those boundaries remain in 11C3–11C5.

### Architecture and integrity

- Migration `20261007220000_pharmacy_quote_order_core` adds normalized quote, line,
  charge, reservation, and order aggregates with controlled statuses, relational
  ownership, exact minor-unit arithmetic checks, legal transition guards, immutable
  commercial snapshots, and deferred aggregate constraints.
- A quote can contain only server-resolved prescription items or approved substitution
  proposals. The service derives medication identity and the remaining dispensable
  balance; clients cannot submit clinical snapshot text or exceed that balance.
- Exactly one held inventory reservation must match every persisted quote and its
  expiry. Inventory is a vendor-neutral operational port and never replaces signed
  prescription, routing, substitution, or dispense facts.
- Patient acceptance uses a serializable transaction. It changes one active quote to
  `ACCEPTED`, creates one immutable order, and creates one purpose-scoped payment with
  the exact quote owner, amount, currency, and expiry.
- Payments now enforce exactly one relational subject: consultation payments reference
  an appointment and pharmacy-order payments reference an order. Database triggers
  reject mismatched owner, amount, currency, purpose, or payable period even when a
  caller bypasses the application service.
- Quote creation and acceptance have principal-scoped idempotency keys. Identical
  retries return the completed resource; changed requests fail closed. A lost database
  race compensates the inventory hold before surfacing failure.

### Security, privacy, and performance

- Explicit policies separate pharmacy quote management, patient acceptance, and
  patient/pharmacy read access. Responses omit the private patient-principal linkage.
- Protected environments reject every non-disabled inventory adapter. The synthetic
  adapter creates deterministic opaque evidence only and is limited to local/test use.
- Quote preparation resolves dispense balances and approved substitutions in bounded
  grouped queries rather than issuing a query per line. Resource reads use primary or
  unique indexes; operational expiry and organization queues have purpose-built
  composite indexes. No unbounded commercial list endpoint was introduced.
- Currency is a validated ISO code supplied per quote; amounts use integer minor units.
  The design has no fixed country, currency, tax code, inventory vendor, payment vendor,
  or cloud-provider assumption.

### Verification evidence

- Prisma formatting, generation, schema validation, contract generation/drift, lint,
  type checks, repository tests, and production builds passed for all workspaces.
- All 16 migrations passed clean installation, prior-schema upgrade, payment-subject
  backfill, transactional repair, concurrent booking, and pharmacy-commercial database
  invariants. The live disposable-database scheduling/payment and prescription
  verifiers also passed after applying the current migration set.
- Commercial service coverage proves fail-closed qualification, server-derived
  snapshots, exact totals, overfill rejection before inventory access, patient-only
  acceptance, deterministic inventory evidence, and no duplicate reservation on an
  idempotent retry.
- The dependency audit reported no known vulnerabilities; the separately documented
  reviewed development-only advisory remains time-bounded for re-review.

### Standards walkthrough

- **Readable and extendable:** the controller, application service, repository, domain
  ports, and adapters have distinct responsibilities. Payment subject expansion remains
  explicit rather than relying on a weak polymorphic identifier.
- **Security first:** authorization precedes sensitive access; production adapters fail
  closed; ownership and commercial identity are independently enforced in PostgreSQL.
- **Query conscious:** quote preparation avoids line-by-line reads, all operational
  scans are indexed and bounded, and no dashboard-style N+1 or unpaginated API was
  added.
- **No magic or hard-coded assumptions:** reservation lifetime is configured, currency
  is per quote, and jurisdiction/vendor choices remain outside the core domain.
- **No short-term patching:** immutable snapshots, compensation, idempotency, deferred
  aggregate checks, and relational subject constraints are implemented at the point
  where the aggregates are introduced, not deferred as cleanup debt.

### Known non-standard or deliberately incomplete boundaries

- Synthetic inventory evidence is not proof of real stock and must never be presented
  as such. Real inventory remains disabled until provider and region qualification.
- Charge codes and amounts are immutable pharmacy-supplied snapshots, not output from a
  qualified tax engine. Any automated jurisdictional calculation requires a separately
  approved adapter and legal review.
- Pharmacy-order webhook effects intentionally fail closed until 11C3 adds the reviewed
  payment/order orchestration. Dispensing remains independent and immutable.
- The browser still uses prototype pharmacy paths; 11C4 owns generated-client/BFF
  cutover and removal of the replaced prototype routes.

### Next checkpoint

11C3 connects authenticated payment success, reversal, refund, and dispute facts to the
pharmacy-order state machine, adds bounded fulfilment handoff state without implementing
logistics, and preserves dispensing as an independent clinical workflow.

## Checkpoint 11C3 completion report

### Increment and scope

Checkpoint 11C3 is complete. Authenticated provider payment facts now drive the matching
pharmacy-order commercial state, while clinical dispensing remains an independent source
of truth. Patients can cancel an unpaid order or initiate a pre-dispense refund; only an
administrator can initiate the post-dispense dispute path. Pharmacy staff can prepare and
complete a pickup or delivery handoff, but handoff completion requires explicit dispense
evidence for every quoted line. This checkpoint does not implement logistics, execute a
real refund/dispute, calculate manager commission reversals, or expose the flow in the
browser; those remain separate bounded consumers or later checkpoints.

### Architecture and integrity

- Migration `20261008100000_pharmacy_order_orchestration` expands the controlled order
  state machine and adds normalized handoff and resolution aggregates. Legal transitions,
  immutable resolution/handoff identity, status timestamps, one pending resolution per
  order, payment/order consistency, and dispense-before-handoff requirements are enforced
  in PostgreSQL as well as the application layer.
- Verified webhook processing validates the payment's relational subject before posting
  effects. An on-time success atomically confirms the order and consumes its inventory
  hold; cancellation or expiry cancels the unpaid order and releases the hold; partial and
  final refunds, reversals, and disputes move the order to their corresponding states.
  Late success and subject/state mismatches are retained as failed webhook evidence and do
  not mutate money or order state.
- Patient cancellation, pharmacy handoff, and administrative dispute commands use named
  authorization policies, optimistic versions, principal-scoped idempotency keys, and
  serializable transactions. Refund and dispute requests are durable outbox facts for a
  separately qualified financial worker rather than direct provider calls inside HTTP
  transactions.
- Handoff method is a vendor-neutral `PICKUP`/`DELIVERY` boundary. No courier, routing, or
  proof-of-delivery behavior is embedded in the pharmacy aggregate; the later logistics
  slice can consume the handoff without rewriting commercial or clinical history.

### Security, privacy, and performance

- Only the owning patient can request cancellation, only a member of the order's pharmacy
  can manage its handoff, and only an administrator can request a post-dispense dispute.
  Managers receive no new patient, order, payment, handoff, or organization visibility.
- Refund/dispute reason codes are bounded controlled identifiers, request payloads are
  strict, money remains integer minor units with per-order currency, and no externally
  supplied amount or patient identity is trusted.
- Order reads load at most one latest resolution and one handoff. Dispense checks use one
  bounded count or grouped aggregate query rather than a query per quote line. Primary,
  unique, partial, and composite indexes cover point reads, pending-resolution uniqueness,
  pharmacy work queues, handoff queues, and future financial consumers.
- Real payment and inventory providers remain disabled. No country, currency, payment
  vendor, inventory vendor, courier, cloud provider, or jurisdiction is hard-coded into
  the workflow.

### Verification evidence

- All 17 migrations passed clean installation, foundation-to-current upgrade,
  payment-subject backfill, transactional repair, concurrent booking, and the expanded
  pharmacy-commercial invariant rehearsal. Schema drift was zero.
- The live PostgreSQL scheduling/payment verifier passed immutable subject identity,
  authenticated-event persistence, duplicate and reordered delivery, late pharmacy
  payment rejection, order confirmation, inventory consumption, partial/final refund
  orchestration, balanced ledger entries, outbox idempotency, reconciliation, and expiry.
- Focused authorization and commercial-service tests cover patient ownership, pharmacy
  membership, administrator-only dispute initiation, and the full named-policy matrix.
  Generated OpenAPI output, contract drift, type checks, and lint passed before the final
  workspace gate.
- The final workspace gate passed all eight production packages: 485 API tests passed
  with one environment-dependent storage test skipped, 16 worker tests passed with nine
  external-service integration tests skipped, all 33 web tests passed, and every
  production build completed. The patched Next.js `16.3.8` web build was repeated after
  the security upgrade.
- The production dependency audit identified the high-severity Next.js image-optimization
  SSRF advisory in `16.3.6`; Next.js and its matching lint rules were upgraded to the
  patched `16.3.8` line. The repeated production audit reports no known vulnerabilities;
  the separately documented development-only advisory remains accepted until its
  time-bounded review date.

### Standards walkthrough

- **Readable and extendable:** controller, application service, repository, payment
  subject dispatcher, domain ports, and database invariants remain separate. Handoff and
  resolution are explicit aggregates rather than nullable columns accumulated on orders.
- **Security first:** every mutation is authenticated, policy-protected, idempotent, and
  version-checked; PostgreSQL independently rejects illegal or incomplete aggregate state.
- **Query conscious:** there are no unbounded list endpoints or line-by-line database
  reads; current point and operational access paths have matching indexes.
- **No magic or hard-coded assumptions:** state values and reason-code formats are
  controlled, currency is carried from the immutable quote, and all external provider and
  regional choices remain behind qualification gates.
- **No short-term patching:** the enum upgrade removes and recreates its dependent
  constraint/trigger transactionally; order/payment and dispense event/line aggregates are
  rehearsed as atomic commits; refund/dispute execution is an outbox boundary rather than
  an unreliable synchronous side effect.

### Known non-standard or deliberately incomplete boundaries

- `payment.refund.requested.v1` and `payment.dispute.requested.v1` are durable intents only.
  A qualified provider adapter, retry/dead-letter worker, operational approval queue, and
  reconciliation evidence are mandatory before a real financial action can be enabled.
- Manager commission and settlement reversal consumption remains in the separately listed
  settlement/payout slice. A refund changes payment, ledger, and pharmacy-order facts but
  must not be represented as a completed manager-earning reversal until that idempotent
  consumer is implemented and the commission eligibility policy is approved.
- `DELIVERY` records the selected handoff boundary only. Courier assignment, location,
  tracking, proof of delivery, and delivery exceptions remain in the logistics slice.
- The browser still uses prototype pharmacy paths. 11C4 owns exact BFF allowlists,
  generated-client integration, parity tests, and deletion of replaced prototype routes.

### Next checkpoint

11C4 connects the browser to the production pharmacy contracts through authenticated,
exactly allowlisted BFF routes and removes the replaced prototype pharmacy actions only
after parity and negative authorization tests pass.

## Checkpoint 11C4 completion report

### Increment and scope

Checkpoint 11C4 is complete. Patient, practitioner, and pharmacy prescription, quote,
order, checkout, cancellation, and handoff screens now use the generated production
contract through authenticated same-origin BFF routes. The replaced generic prescription,
prescription-item, pharmacy-order, pharmacy-order-item, and uploaded-prescription resource
exposure has been removed, as have the prototype issue, upload, direct-order, order-create,
and order-progress actions. OTC commerce remains deliberately deferred rather than being
reintroduced through an unqualified shortcut.

### Architecture and access boundaries

- Patient and practitioner prescription history, patient quote/order history, and pharmacy
  quote/order work queues are owner-scoped cursor APIs. The browser cannot supply a patient
  principal or pharmacy identity to broaden access; patient ownership comes from the
  authenticated principal, while pharmacy organization selection is re-authorized against
  the authenticated membership on every API request.
- BFF catch-all files are constrained by exact segment counts, UUID validation, bounded
  query forwarding, method-specific CSRF enforcement, and the production route allowlist.
  Arbitrary paths and forged query fields fail closed.
- Organization membership now carries its organization type from the identity repository
  to the browser session. Portal selection and organization identifiers therefore come
  from authenticated membership rather than a legacy user-role or profile-id assumption.
- Generated OpenAPI types remain the browser service boundary. The clinical/commercial
  domain services, authorization policies, repositories, controllers, BFF, and UI remain
  separately owned layers so a later mobile client or new fulfillment channel does not
  require weakening the API.

### Data and performance

- Lists use descending `(created_at, id)` cursor pagination with a maximum page size of 50;
  there are no unbounded prescription, quote, or order reads.
- Patient and practitioner prescription indexes already matched the new query shapes.
  Migration `20261008130000_pharmacy_list_indexes` adds organization/time indexes for the
  pharmacy quote and order work queues, and related aggregates are loaded with join
  strategy instead of per-row reads.
- The prescription verification is repeatable, exercises patient and practitioner list
  ownership against PostgreSQL, and continues to verify the indexed 5,000-route work queue.

### Verification evidence

- Formatting, lint, generated-contract drift, and type checks passed for all eight
  production packages.
- The complete test gate passed: 489 API tests with one environment-dependent storage test
  skipped, 35 web tests, 16 worker tests with nine external-service integration tests
  skipped, and all package tests.
- All 18 migrations passed clean-install, prior-schema upgrade, payment-subject backfill,
  transactional repair, and pharmacy-commercial invariant rehearsals. Both Prisma schemas
  validate, and the live PostgreSQL prescription verifier passed owner-scoped lists plus
  the existing clinical integrity and concurrency checks.
- Every production package built successfully, including the Next.js route manifest and
  standalone server package. The production dependency audit found no known
  vulnerabilities; the documented development-only advisory remains time-bound for review.

### Standards walkthrough

- **Readable and extendable:** contract, policy, application, persistence, BFF, and UI
  responsibilities remain explicit. Shared list helpers remove duplication without hiding
  authorization decisions.
- **Security first:** patient identity is never accepted from list query parameters,
  pharmacy identity is membership-checked, CSRF and idempotency protections remain intact,
  and all replaced generic clinical/commercial CRUD paths are deleted.
- **Query conscious:** every growing list is bounded and cursor-indexed, aggregate loading
  avoids N+1 reads, and dedicated organization/time indexes support the pharmacy queues.
- **No magic or hard-coded assumptions:** currencies remain ISO values supplied by the
  immutable quote; organization type is authenticated data; country, jurisdiction,
  inventory, payment, cloud, and logistics providers remain configurable or gated.
- **No short-term patching:** unsafe prototype functionality and dead screens were removed
  instead of wrapped; prescription creation now uses the required appointment identity;
  and the verifier was made repeatable rather than relying on a one-run database.

### Known non-standard or deliberately incomplete boundaries

- Real clinical, inventory, payment, refund/dispute, and logistics providers remain
  disabled pending qualification. Synthetic success is not production approval.
- Paper-prescription upload and direct OTC ordering were removed because no production
  document-verification or OTC commercial policy exists yet. Reintroduction requires a
  separately reviewed workflow, not restoration of the deleted generic routes.
- An interactive UI smoke run was not claimed in this environment because its trusted
  browser automation bridge was unavailable. Contract, route-policy, production-build,
  and server-side integration evidence passed; 11C5 must capture qualified end-to-end
  browser evidence in the release environment.

### Next checkpoint

11C5 records product, clinical, pharmacy-operations, privacy/security, and financial-owner
qualification evidence. It must not enable any real provider or jurisdiction merely because
the synthetic workflow and browser cutover are complete.
