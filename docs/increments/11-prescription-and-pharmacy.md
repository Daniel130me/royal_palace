# Increment 11 — prescription and pharmacy

## Status

**In progress. Not approved for real clinical use.** The product owner approved the
prescription and pharmacy rules on 2026-10-07. Checkpoint 11A establishes the
production prescription aggregate and patient-directed pharmacy routing in the
synthetic local/test environment. Dispensing, substitutions, refill consumption,
commercial orders, frontend migration, and qualified jurisdiction activation remain
open. `CLINICAL_WORKFLOW_MODE` defaults to `disabled`, and staging/production reject
every non-disabled value until clinical and legal qualification is completed.

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
- [ ] Connect the frontend and retire the corresponding prototype issue/upload/order
      routes only after the complete pharmacy slice is available.

### 11B — dispensing, substitution, and refill accounting

- [ ] Add immutable dispense events and per-item quantity/refill balances; never infer
      dispensing from an order status.
- [ ] Add substitution proposals, explicit patient consent, jurisdiction policy hooks,
      and practitioner approval where required.
- [ ] Add partial-dispense, completion, rejection/return-to-patient, cancellation, and
      expiry concurrency tests.
- [ ] Add purpose-minimized transactional notifications without clinical details.

### 11C — pharmacy commercial and operational workflow

- [ ] Add inventory-facing quote/reservation boundaries without making inventory the
      clinical source of truth.
- [ ] Add pharmacy order/payment/fulfilment states using integer minor units and the
      existing provider-neutral payment and ledger boundaries.
- [ ] Replace the prototype pharmacy pages and action routes with generated contracts
      and exact BFF allowlists; remove generic prescription CRUD exposure.
- [ ] Complete clinical-owner review evidence and keep real activation disabled until
      every jurisdiction gate is approved.

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
