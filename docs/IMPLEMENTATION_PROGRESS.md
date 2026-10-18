# Production implementation progress

**Controlling specification:**
[`PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md`](./PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md)

**Purpose:** This is the checked execution tracker for the controlling plan. It does
not replace or reinterpret that plan. Section 9 defines the strategic phases; Section
19 defines the mandatory implementation order. Update this file in the same commit
that completes an increment.

## Status legend

- `[x]` complete, validated, committed, and pushed
- `[~]` actively being implemented; not yet accepted as complete
- `[ ]` not started
- `[!]` blocked by a material decision or external dependency

## Strategic phase status

- `[~]` **Phase 0 — Scope, safety, and production design.** The current-state baseline
  and ADR 0001 are complete. Threat modelling, NDPA/DPIA work, clinical review, final
  role/field matrix approval, SLO/RTO/RPO approval, deployment region/data-residency
  approval, and the identity/payment/queue/observability ADRs remain open. Development
  foundation work may continue; these items block their relevant production work and
  public launch.
- `[~]` **Phase 1 — Engineering and infrastructure foundation.** Increments 01–03 are
  complete. Managed cloud provisioning and deployment/restore
  evidence remain future work and require the relevant Phase 0 decisions.
- `[~]` **Phase 2 — Identity, sessions, and authorization.** Increments 04A and 05 are
  complete.
  Production-provider qualification is tracked separately as the deferred, mandatory
  Increment 04B gate.
- `[~]` **Phase 3 — PostgreSQL domain foundation.** Increment 03 established the
  foundation; domain models will be extended by each later vertical slice.
- `[~]` **Phase 4 — Production vertical slices and frontend connection.** Increment 06
  is complete. The remaining production slices are delivered by Increments 07–09 and 11.
- `[ ]` **Phase 5 — Payments, files, and asynchronous integrations.** Delivered by
  Increments 09–10 and relevant Increment 11 slices.
- `[ ]` **Phase 6 — Clinical integrity and privacy operations.** Delivered by the
  clinical portions of Increment 11 and release qualification.
- `[ ]` **Phase 7 — Security, reliability, and performance qualification.** Delivered
  by Increment 12.
- `[ ]` **Phase 8 — Migration, controlled launch, and rollback.** Delivered by
  Increment 12.
- `[ ]` **Phase 9 — Post-launch operation.** Begins after controlled launch.

## Exact delivery sequence

- `[x]` **Increment 00 — Protect the current baseline**
  - Evidence: [`current-state-baseline.md`](./current-state-baseline.md)
  - Completion commits: `9474f39`, `243b2a8`, `48f8ffc`
- `[x]` **Increment 01 — Workspace and quality gates**
  - Evidence:
    [`increments/01-workspace-and-quality-gates.md`](./increments/01-workspace-and-quality-gates.md)
  - Completion commit: `e9c3caf`
- `[x]` **Increment 02 — Configuration, telemetry, and local dependencies**
  - Completion commit: `9acd814`
  - `[x]` Typed startup configuration and fail-closed validation implemented.
  - `[x]` Safe root `.env.example` added.
  - `[x]` Local PostgreSQL, Redis, MinIO, and ClamAV definitions added.
  - `[x]` Structured JSON logging, redaction, request IDs, and trace propagation
    implemented.
  - `[x]` Graceful shutdown and bounded dependency readiness implemented.
  - `[x]` Unit and HTTP tests added for configuration, telemetry, and readiness.
  - `[x]` Frozen-lockfile install, format, type-check, lint, test, build, database
    validation, and dependency-audit gates pass on the final tree.
  - `[x]` Static Compose validation and available runtime smoke tests are recorded.
  - `[x]` Section 20 completion report is added.
  - `[x]` Increment is committed and pushed to `origin/feat_prod`.
- `[x]` **Increment 03 — Database foundation**
  - Evidence:
    [`increments/03-database-foundation.md`](./increments/03-database-foundation.md)
  - Completion commit: `281e9fb`
  - `[x]` Establish the API-owned PostgreSQL Prisma boundary without changing the
    prototype SQLite schema.
  - `[x]` Add constrained identity-reference, organization, membership,
    role-assignment, audit-event, idempotency, outbox, and inbox foundations.
  - `[x]` Add explicit migration SQL, synthetic-only seed data, and production-safe
    seed guards.
  - `[x]` Add clean-install and representative upgrade migration verification.
  - `[x]` Add a constrained API infrastructure boundary for future capability-owned
    repositories; no generic CRUD repository was introduced.
  - `[x]` Review first lookup/list indexes using representative PostgreSQL query
    plans and record the evidence.
  - `[x]` Rehearse rollback/repair, run all quality gates, and publish the Section 20
    completion report.
  - `[x]` Commit and push the completed increment to `origin/feat_prod`.
- `[x]` **Increment 04A — Vendor-neutral identity and secure BFF session foundation**
  - Evidence:
    [`increments/04a-vendor-neutral-identity-and-secure-sessions.md`](./increments/04a-vendor-neutral-identity-and-secure-sessions.md)
  - Implementation commit: `e978076`
  - `[x]` Record the provider-neutral architecture and the deferred qualification gate.
  - `[x]` Separate internal principals from external `(issuer, subject)` identities.
  - `[x]` Implement Authorization Code + PKCE behind a provider-neutral adapter.
  - `[x]` Implement encrypted server-managed BFF sessions, CSRF/origin protection,
    refresh, logout, revocation, current-user, and step-up contracts.
  - `[x]` Enforce application-owned roles/memberships and authentication assurance.
  - `[x]` Remove plaintext/default credentials, browser identity authority, and
    `x-rp-session` authorization from the active path.
  - `[x]` Add an explicitly enabled, loopback-only synthetic OIDC runtime and seeded
    reviewer principals for browser acceptance testing without weakening the protected
    environment boundary.
  - `[x]` Pass conformance, security, migration, and repository quality gates; publish
    the Section 20 completion report; commit and push.
- `[!]` **Increment 04B — Production identity-provider qualification**
  - Intentionally deferred by the product owner on 2026-09-28 so synthetic-data
    implementation can continue without vendor lock-in.
  - This is a mandatory gate before protected staging accepts non-synthetic users,
    before any real-user identity migration, and before Increment 12 begins.
  - Still requires provider, tenant region, privacy/legal terms, MFA/recovery,
    infrastructure cost, operational ownership, and exit-plan approval.
- `[x]` **Increment 05 — Policy engine and audit boundary**
  - Evidence:
    [`increments/05-policy-engine-and-audit-boundary.md`](./increments/05-policy-engine-and-audit-boundary.md)
  - Implementation commit: `a2fbd29`
  - `[x]` Define strongly typed named RBAC/ABAC policies with default deny.
  - `[x]` Implement the Section 22 role, ownership, membership, consent, assignment,
    redaction, and manager-privacy rules in a provider-neutral policy engine.
  - `[x]` Append every protected decision to the immutable audit store and fail closed
    when that audit fact cannot be persisted.
  - `[x]` Route administrative principal-session revocation through the named policy and
    mark the controller operation for architectural inventory checks.
  - `[x]` Disable unmigrated prototype Next.js APIs in staging and production while
    retaining them only for local/test prototype review.
  - `[x]` Add exhaustive table-driven role-policy, object-ownership, membership,
    consent, redaction, audit, and protected-route tests.
  - `[x]` Complete full repository, migration, security, and remote CI validation;
    publish the completion report; commit and push.
- `[x]` **Increment 06 — Public discovery vertical slice**
  - Evidence:
    [`increments/06-public-organization-discovery-checkpoint.md`](./increments/06-public-organization-discovery-checkpoint.md)
  - Implementation commit: `6a6fdfe`
  - `[x]` Add normalized organization public profiles, facility locations, service
    taxonomy, organization offerings, and facility-specific availability with
    database constraints and discovery indexes.
  - `[x]` Add public-safe hospital, pharmacy, laboratory, and service contracts plus a
    bounded, stable cursor API that excludes unverified, unpublished, suspended, and
    private data.
  - `[x]` Add narrowly allowlisted BFF routes and connect the patient hospital,
    pharmacy, and laboratory finders to server-side search, service/location filters,
    accessible retry states, and pagination.
  - `[x]` Complete PostgreSQL migration, repeatable synthetic seed, zero-drift,
    clean-upgrade/repair, bounded-query, query-plan, API/web test, and production-build
    evidence for organization discovery.
  - `[x]` Model practitioners as independent aggregates with optional, non-authoritative
    facility affiliations, governed profession/specialty catalogues, public credentials,
    global locations, languages, and consultation modes.
  - `[x]` Add public-safe practitioner discovery and catalogue APIs with bounded filters,
    stable cursors, single-query projections, privacy tests, and representative index
    plan evidence.
  - `[x]` Introduce the generated OpenAPI client with deterministic drift verification;
    adopt it in the frontend service boundary and connect the patient practitioner finder.
  - `[x]` Publish the completion report and pass the complete repository, migration,
    discovery, query-plan, generated-client, build, and dependency-audit gates.
- `[x]` **Increment 07 — Onboarding and administrative verification**
  - Evidence:
    [`increments/07-onboarding-and-administrative-verification.md`](./increments/07-onboarding-and-administrative-verification.md)
  - Implementation commits: `13915dc`, `40090f4`
  - `[x]` Add normalized patient, organization, and independent-practitioner application
    aggregates with a constraint-backed seven-state lifecycle and append-only history.
  - `[x]` Enforce applicant ownership, support review-only access, administrator-only
    decisions, manager exclusion, and facility-independent practitioner approval.
  - `[x]` Connect applicant, support, administrator, and governed clinical-catalogue
    interfaces through exact CSRF-protected BFF routes and generated API contracts.
  - `[x]` Pass clean/upgrade/repair migration, constraint, drift, repeatable seed,
    bounded-query, representative index-plan, repository, audit, and secret-scan gates.
- `[x]` **Increment 08 — Manager attribution, earnings, and restricted support**
  - Evidence:
    [`increments/08-manager-attribution-earnings-and-restricted-support.md`](./increments/08-manager-attribution-earnings-and-restricted-support.md)
  - Implementation commit: `286f6d2`
  - `[x]` Add purpose-scoped signed referral links and atomic applicant-controlled
    patient/organization attribution without manager access to private applications.
  - `[x]` Preserve immutable attribution history and governed effective-dated commission
    policy with optimistic concurrency and privileged step-up checks.
  - `[x]` Add private settled-activity ingestion and manager-only commission projections
    using integer minor units, per-currency totals, and explicit time zones.
  - `[x]` Add restricted manager support tickets with manager-visible and internal notes,
    controlled transitions, and minimal identifying information.
  - `[x]` Connect exact generated contracts, BFF routes, manager/support/admin interfaces,
    and fail closed the replaced prototype routes in protected environments.
  - `[x]` Pass repository, migration, drift, seed, query-plan, audit, secret-scan, build,
    and exact-head remote CI gates; publish the Section 20 completion report.
- `[x]` **Increment 09 — Appointment and payment vertical slice**
  - Evidence:
    [`increments/09-appointment-and-payment-vertical-slice.md`](./increments/09-appointment-and-payment-vertical-slice.md)
  - Implementation commit: `efcbf3f`
  - `[x]` Add administrator-governed effective-dated fees, bounded provider availability,
    immutable appointment price snapshots, and database-enforced single-slot booking.
  - `[x]` Add a provider-neutral hosted-checkout boundary, authenticated idempotent webhook
    inbox, explicit payment transitions, immutable balanced ledger, and reconciliation.
  - `[x]` Emit exactly-once settled-activity outbox events without exposing patient gross
    payments or provider references through the manager boundary.
  - `[x]` Connect generated OpenAPI contracts, signed BFF routes, and patient booking/payment
    status interfaces while rejecting redirect parameters as payment authority.
  - `[x]` Pass repository, migration, concurrency, persistence, query-plan, audit,
    secret-scan, build, and exact-head remote CI gates; publish the Section 20 report.
- `[~]` **Increment 10 — Files, notifications, and worker reliability**
  - `[x]` Add purpose-bound, checksum-bound, single-write presigned onboarding uploads;
    completion checks exact object metadata and owner scope.
  - `[x]` Quarantine files, verify bytes and detected MIME, scan asynchronously, and
    release only a versioned clean copy. Downloads require existing policy and audit.
  - `[x]` Rehearse local S3, ClamAV, and PostgreSQL leasing with synthetic integration
    tests; keep production malware-provider and object-storage configuration gated.
  - `[ ]` Add channel-specific notifications, verified recipients, durable attempts,
    provider IDs, dedupe, retry/dead-letter alerts, and an authorized replay procedure.
    - `[x]` Provider-neutral delivery/attempt tables, privacy-safe versioned templates,
      lease recovery, bounded retry/dead-letter behavior, structured dead-letter events,
      deterministic synthetic idempotency, and administrator-only replay are implemented.
    - `[x]` Email-first policy is implemented with OIDC/UserInfo-verified endpoints,
      irreversible replacement, mandatory security/transactional categories, explicit
      marketing-consent constraints, English-only fail-closed templates, delivery-time
      resolution, and atomic application/appointment/payment intents.
    - `[ ]` Real email adapter, sending region/domain, suppression and delivery webhooks,
      audited preference UI, and production alert routing remain approval-gated.
  - `[ ]` Approve production email/SMS/push vendors and privacy-safe content policy;
    qualify production bucket IAM, GuardDuty scan tagging, lifecycle, and alerting.
- `[~]` **Increment 11 — Remaining operational and clinical slices**
  - Evidence: [`increments/11-prescription-and-pharmacy.md`](./increments/11-prescription-and-pharmacy.md)
  - `[x]` Product owner approved the prescription/pharmacy state, ownership,
    immutability, visibility, substitution, and controlled-medication rules.
  - `[x]` Checkpoint 11A adds the synthetic-only production prescription aggregate,
    verified-practitioner attestation, patient-directed verified-pharmacy routing,
    minimal pharmacy visibility, append-only history, bounded expiry, migration and
    concurrency verification, indexed representative queue evidence, and a generated
    drift-checked service contract. The checkpoint is complete but not approved for
    real clinical use.
  - `[x]` Checkpoint 11B adds jurisdiction-policy-gated substitution proposals,
    immutable patient/practitioner decisions and dispense events, idempotent event
    retries, server-derived medication snapshots, partial/full quantity and refill
    accounting, safe return/rerouting, concurrency verification, paginated history,
    and privacy-safe notification intents. It remains synthetic-only and is not
    approved for real clinical use.
  - `[~]` Checkpoint 11C commercial rules were approved on 2026-10-07.
    - `[x]` 11C1 adds immutable payment purpose and payable-period identity, preserves
      existing appointment behavior, removes checkout's dependency on appointment
      expiry, dispatches webhook effects through an explicit subject boundary, and
      verifies prior-data backfill plus database immutability.
    - `[x]` 11C2 adds immutable prescription-fill quote snapshots, exact line/tax/fee
      arithmetic, vendor-neutral inventory reservation evidence, explicit patient
      acceptance, pharmacy orders, and an exactly-one payment-subject constraint.
      It remains synthetic-only; no real inventory or payment provider is enabled.
    - `[x]` 11C3 connects authenticated success, cancellation, expiry, refund,
      reversal, and dispute facts to pharmacy orders; adds patient cancellation,
      administrator-only post-dispense disputes, and dispense-gated pickup/delivery
      handoff. Real financial providers and logistics remain disabled.
    - `[~]` 11C4 cut patient, practitioner, and pharmacy prescription/order screens
      over to generated production contracts and exact authenticated BFF allowlists;
      removed the replaced unsafe actions and generic CRUD exposure; and added indexed
      owner-scoped lists. On 2026-10-08 the product owner clarified that the signed
      prototype is mandatory functional scope. The deleted paper-upload, pharmacy
      detail/OTC, inventory/catalogue, delivery, notification, commercial-reporting,
      settings, and admin-order capabilities are therefore a release-blocking parity
      regression, not cancelled scope. Corrective checkpoints 11C4P-1–11C4P-5 are
      tracked in
      [`PROTOTYPE_PRODUCTION_PARITY.md`](./PROTOTYPE_PRODUCTION_PARITY.md).
      - `[x]` 11C4P-1 records 139 approved capabilities across 11 portals, retains all
        signed visual references, and runs a fail-closed parity verifier before every
        workspace verification/CI run. Functional navigation returns with each secure
        production replacement rather than exposing broken prototype routes.
      - `[x]` 11C4P-2 internal pharmacy catalogue and inventory ledger.
        - `[x]` 11C4P-2A delivers controlled classifications, pharmacy-scoped SKUs and
          locations, expiry-ordered lots, materialized aggregate balances protected by
          deferred database invariants, immutable idempotent receipt/adjustment
          evidence, bounded indexed reads, named authorization/audit policy, generated
          OpenAPI/BFF contracts, and the approved Products, Inventory, and product-detail
          screens.
        - `[x]` 11C4P-2B connects explicit catalogue selection, atomic FEFO lot
          allocations, payment commit/release, expiry/cancellation compensation, and
          dispense consumption to the existing quote/order/prescription workflow. A
          bounded `SYSTEM_WORKER` expiry boundary reclaims abandoned holds safely under
          concurrent runs. The platform-owned adapter is allowed in protected
          environments; synthetic inventory remains prohibited there.
      - `[x]` 11C4P-3 OTC/direct ordering. Verified pharmacy discovery now opens the
        approved catalogue/cart experience. Patient-safe bounded catalogue reads hide
        operational stock data; server-owned price snapshots, item eligibility,
        idempotency, FEFO holds, payment creation, cancellation, direct handoff
        consumption, database source constraints, and audit authorization all reuse the
        production commercial aggregate. Protected activation stays disabled pending
        jurisdictional tax/fee and provider qualification; no browser-supplied charge
        can enter the quote.
      - `[x]` 11C4P-4 scanned-prescription upload, verification, review, and conversion.
        - `[x]` 11C4P-4A provides patient-owned upload intents, private quarantine,
          byte/checksum/type verification, asynchronous malware scanning, clean-object
          release, bounded status history, short-lived downloads, optional routing to
          one verified pharmacy, generated contracts/BFF routes, and the approved upload
          and history screens. Storage coordinates never enter public contracts.
        - `[x]` 11C4P-4B adds pharmacy-assignment-scoped review and clean-document
          download, patient-visible information requests, actor-attributed append-only
          decisions, and controlled conversion to one server-priced, inventory-held
          scanned-origin quote. Controlled medicines remain fail-closed, and the upload
          never becomes a practitioner-authored digital prescription.
      - `[x]` 11C4P-5 notifications, settings, delivery integration, and admin order
        oversight.
        - `[x]` 11C4P-5A connects the pharmacy notification inbox and operational
          settings. Personal and organization inbox entries use per-reader receipts,
          bounded indexed cursor reads, session-derived recipient scope, explicit
          marketing opt-in, immutable mandatory security/transactional preferences,
          generated contracts, exact BFF allowlists, and optimistic settings updates.
          External delivery remains provider-gated and never contains clinical details.
        - `[x]` 11C4P-5B connects pharmacy-scoped delivery handoff visibility and
          bounded administrator order oversight. Dedicated response projections exclude
          patient identity, prescriptions, medication lines, and delivery addresses;
          exact BFF filters, named admin authorization, cursor indexes, and generated
          contracts keep both queues controlled. Courier assignment, tracking, and proof
          of delivery remain with the later logistics aggregate.
    - `[!]` 11C5 qualification evidence is open. The controlled evidence register and
      sign-off packet is in
      [`qualification/11c5-prescription-pharmacy-qualification.md`](./qualification/11c5-prescription-pharmacy-qualification.md).
      Real activation remains blocked on the recorded clinical, pharmacy, legal/privacy,
      financial, security, operations, provider, jurisdiction, and UAT decisions.
  - `[~]` Checkpoint 11D laboratory is in progress. Evidence:
    [`increments/11d-laboratory.md`](./increments/11d-laboratory.md).
    - `[x]` 11D1 establishes the additive request/booking aggregate, append-only
      histories, PostgreSQL state and ownership constraints, queue/owner indexes,
      application state machines, and default-deny practitioner/patient/exact-lab
      authorization. It is synthetic-only and has no real clinical activation.
    - `[x]` 11D2A adds verified-practitioner request creation, patient-owned verified
      laboratory routing, idempotent booking, exact-organization queues/detail,
      controlled collection/processing/cancellation transitions, business audit,
      generated OpenAPI, and exact BFF allowlists. Cross-laboratory history is filtered
      at the response boundary and real activation remains disabled.
    - `[x]` 11D2B connects practitioner ordering, patient verified-laboratory selection,
      exact-organization dashboard/queues/detail, scheduling, collection, processing,
      and cancellation screens to generated production contracts.
    - `[x]` 11D3A establishes normalized result components, secure attachment lifecycle
      metadata, append-only amendments and status history, publication immutability,
      explicit critical-result ownership/deadlines/states, durable notification linkage,
      and bounded patient/practitioner/laboratory/escalation indexes. No new clinical table
      is exposed before its application and authorization boundary exists.
    - `[x]` 11D3B establishes secured structured-result drafting, review, publication,
      amendment, bounded patient/practitioner/laboratory reads, critical acknowledgement and
      resolution APIs, generated contracts, and exact browser allowlists.
    - `[x]` 11D3C extends the shared quarantine-first scanner to laboratory-result
      attachments and adds a bounded, concurrency-safe overdue critical-result escalation
      worker with privacy-safe durable notifications.
    - `[x]` 11D3D connects secure result entry, laboratory/patient/practitioner result
      views, clean-attachment downloads, controlled publication, critical acknowledgement,
      and the laboratory dashboard/critical-results readers. The unauthenticated legacy
      publication action and direct generic result collection are retired.
    - `[~]` 11D4 has replaced the embedded patient-record, practitioner-dashboard,
      practitioner-patient, and encounter result widgets with bounded published-result
      projections. Durable home collection now uses an immutable structured address snapshot,
      exact-service capability gating, patient/exact-laboratory disclosure, and practitioner
      address redaction. The Services, Notifications, and Settings screens now use an
      exact-organization workspace projection and the shared production notification inbox;
      their approved visual surface remains intact. Governed commercial pricing, verified ratings,
      and team administration are connected; billing, protected migration/load execution, and
      qualification remain open. Every approved
      laboratory, patient, and practitioner prototype capability remains in the release
      register.
    - `[x]` 11D4E adds one immutable verified rating per patient-owned completed laboratory
      booking, private-by-default moderated comments, database-maintained organization rating
      aggregates, protected patient submission/list routes, and connected patient, discovery,
      and laboratory-profile presentation surfaces.
    - `[x]` 11D4F adds an administrator-only, privacy-minimized comment-moderation queue,
      controlled publish/hide decisions, actor-attributed database evidence, optimistic
      concurrency, immutable score/comment protection, audit events, exact BFF routes, and a
      dedicated administrator screen.
    - `[x]` 11D4G adds shared organization-team governance: exact organization-admin authority,
      founder-role backfill through approved application linkage, hashed expiring single-use staff
      invitations, transactional acceptance/revocation/deactivation, audit evidence, bounded team
      reads, a generated contract, exact BFF routes, and connected laboratory settings plus an
      authenticated invitation-acceptance screen.
    - `[x]` 11D4H adds representative database-performance fixtures for 5,000 laboratory
      workflows and 500 critical results, eight exact laboratory query-plan assertions,
      organization-team migration invariants and two-connection acceptance concurrency evidence,
      transactional enum migration enforcement, and a successful automated scope-lock audit of
      139 approved prototype capabilities. Disposable PostgreSQL 17.6 now proves the clean/upgrade
      path and every representative index. Concurrent duplicate invitations deterministically
      consume one token as accepted and the redundant token as revoked while returning one active
      membership and role. A forward-only atomic migration also aligns deployed constraint metadata
      with Prisma without rewriting published migrations; the exact drift gate reports no difference.
      Database CI now declares its loopback synthetic issuer explicitly so the security-checked seed
      can prove idempotency without weakening its environment validation. Protected CI confirmation,
      billing, and qualification remain open.
  - `[~]` 11E logistics is in progress. The verified-logistics-organization delivery aggregate,
    immutable fulfilment/assignment/status/proof evidence, APIs/BFF, recipient-code workflow,
    privacy-minimized projections, and all signed logistics screens are production-connected.
    Authorization, replay, cursor, projection, state-machine, migration, and concurrency tests are
    implemented, and the performance harness now loads 5,000 complete synthetic workflows for
    exact queue/history index assertions. A guarded atomic browser-review fixture is included.
    Native PostgreSQL 18 and protected CI PostgreSQL 17.6 now confirm the exact queue/history
    indexes, clean/upgrade migration paths, zero drift, and repeatable synthetic seed. Visual
    comparison, stakeholder UAT, governed commercial policy, provider qualification, and real
    activation remain open; no real logistics use is enabled.
  - `[~]` 11G settlement/payout and advanced-finance reporting now persists immutable
    currency-separated statements, snapshots each included earning exactly once, marks finalized
    statements for reconciliation after negative payment events, enforces requester/reviewer/executor
    separation, and provides a vendor-neutral payout gateway that remains disabled in protected
    environments. The admin Settlements and Reports screens are connected to these production
    boundaries. Pharmacy, practitioner, logistics, hospital, manager, tax, and platform-revenue
    formulas remain deliberately uncreated until their commercial rules are approved; corresponding
    signed-prototype report sections remain tracked rather than removed. See
    [`increments/11g-settlements-payouts-and-reporting.md`](./increments/11g-settlements-payouts-and-reporting.md).
  - `[x]` 11H public care discovery parity replaces the public home, practitioner directory,
    and practitioner-profile prototype data paths with the bounded generated discovery and
    scheduling contracts. Public pages now show only independently verified projections and
    server-published availability/pricing facts; invented metrics, fabricated appointment slots,
    generic resource access, Nigeria-only presentation assumptions, and demo-only production copy
    are removed while preserving the signed visual capabilities. Patient and public practitioner
    lists share one extendable directory surface rather than duplicating security and pagination
    behavior. See
    [`increments/11h-public-care-discovery-parity.md`](./increments/11h-public-care-discovery-parity.md).
  - `[x]` 11I public information and pricing parity connects Help to deployment-qualified
    support configuration, replaces demo copy in How It Works with the implemented secure
    journey, and replaces generic prototype pricing with a bounded current-price projection.
    Only active effective patient prices are public; payout, actor, draft, and retired data stay
    private. See
    [`increments/11i-public-information-and-pricing.md`](./increments/11i-public-information-and-pricing.md).
  - `[x]` 11J administrator oversight parity connects the approved admin portal shell,
    appointment oversight, and audit trail to bounded PostgreSQL projections. Administrator-only
    policies, exact BFF allowlists, filter-bound keyset cursors, privacy-minimized selects,
    server-side filtering, currency-neutral display, and supporting indexes replace the unbounded
    generic prototype reads. Finance users sharing the admin shell now see only their authorized
    finance navigation; the backend remains the final authorization boundary. See
    [`increments/11j-admin-oversight-and-portal.md`](./increments/11j-admin-oversight-and-portal.md).
  - `[x]` 11K administrator operations parity connects the approved dashboard, complaint
    triage, and delivery-oversight screens to the administration boundary. It adds a durable,
    versioned complaint workflow with immutable actor-attributed history, bounded server-side
    filters, exact BFF allowlists, least-privilege delivery projections, currency-separated
    payment volume, attention counts, and representative index-plan evidence. See
    [`increments/11k-admin-operations.md`](./increments/11k-admin-operations.md).
  - `[~]` 11L practitioner verification governance connects the administrator provider
    queue and verification controls to production onboarding and practitioner records.
    Bounded indexed reads, administrator-only policy enforcement, optimistic concurrency,
    immutable verification history, clean-document access, and jurisdiction-neutral
    credential presentation replace the generic prototype data path. Provider fees,
    earnings, payout enrollment, and payouts remain tracked under the practitioner detail
    and finance work. See
    [`increments/11l-practitioner-verification-governance.md`](./increments/11l-practitioner-verification-governance.md).
  - `[~]` 11M manager privacy parity replaces the signed pharmacy/laboratory portfolio
    screens with production referral-status views that preserve the approved UI capability
    without disclosing organization records, patient information, gross payments, or assignment
    history. Manager notifications and consent settings now use the production notification
    boundary. Laboratory and logistics parity rows were reconciled to their already-completed
    11D/11E evidence. Manager payout destinations and governed programme documents remain open.
    See [`increments/11m-manager-privacy-parity.md`](./increments/11m-manager-privacy-parity.md).
  - `[~]` 11N personal-role notification parity connects the patient, practitioner,
    and manager signed inbox screens to one session-derived, cursor-bounded production
    notification component. It removes caller-selected recipient IDs and generic collection
    reads while preserving privacy-safe references and durable read receipts. The parity
    register also reconciles signed patient/practitioner clinical and laboratory screens to
    their already-completed 11D/11F evidence; stakeholder UAT remains open. See
    [`increments/11n-personal-role-notification-parity.md`](./increments/11n-personal-role-notification-parity.md).
  - `[x]` 11O parity-register evidence reconciliation records three completed surfaces
    whose rows lagged their implementation evidence: the governed administrator pricing
    screen from 11D4C, the production pharmacy portal shell from 11C4P-5, and the public
    site shell whose routed pages were completed through 11I. This changes technical
    connection status only; it does not substitute for stakeholder UAT or launch approval.
  - `[~]` 11P pharmacy finance parity restores the signed earnings/commission,
    settlement, and payout routes on the production organization-finance boundary. The
    corrective UI removes ambiguous commission assumptions, keeps currencies separate,
    and leaves real transfer execution disabled until provider and regional qualification.
    See [`increments/11p-pharmacy-finance-parity.md`](./increments/11p-pharmacy-finance-parity.md).
  - `[~]` 11Q provider patient and referral parity replaces the provider roster's
    appointment scan and per-patient requests with one privacy-minimized, indexed,
    keyset-paginated projection. Referral inboxes are now exact-sender/exact-recipient
    views, named recipients resolve from verified practitioner data, and accept/decline
    decisions use idempotency, optimistic concurrency, immutable history, and audit.
    Acceptance deliberately does not imply broad clinical-record access. Open-specialty
    claiming, qualified clinical governance, and stakeholder UAT remain open. See
    [`increments/11q-provider-patients-and-referrals.md`](./increments/11q-provider-patients-and-referrals.md).
  - `[~]` 11R connects the complete signed hospital portal to the verified production
    discovery projection and reconciles administrator reports/settlements plus manager
    resources to their existing 11G/11M evidence. The hospital session supplies the
    organization identity; the screen receives no private application, workforce,
    financial, or clinical data. See
    [`increments/11r-hospital-and-evidence-reconciliation.md`](./increments/11r-hospital-and-evidence-reconciliation.md).
  - `[~]` 11S separates patient and practitioner account profiles from the clinical
    encounter aggregate and connects owner-scoped settings to bounded PostgreSQL reads and
    optimistic writes. Practitioner public settings are connected. The patient screen now
    connects verified identity fields, language preference, notification consent, privacy
    navigation, and session controls; the signed health-profile and emergency-contact editing
    capabilities remain explicitly open pending their governed records and verification rules.
    See [`increments/11s-account-profile-settings.md`](./increments/11s-account-profile-settings.md).
  - `[x]` 11T connects the signed administrator users screen to a dedicated identity-principal
    administration boundary. Bounded indexed reads, administrator-only policy, optimistic and
    serializable status transitions, final-administrator and self-disable protection, atomic
    session revocation, immutable audit evidence, strict BFF allowlists, and generated contracts
    replace prototype account data without exposing identity-provider credentials. See
    [`increments/11t-identity-administration.md`](./increments/11t-identity-administration.md).
  - `[~]` 11F clinical encounters and patient records has completed its production encounter
    foundation, related clinical actions, and signed-prototype screen connection. Controlled
    visual comparison and stakeholder UAT remain open and are tracked in
    [`increments/11f-clinical-encounters-and-records.md`](./increments/11f-clinical-encounters-and-records.md).
- `[ ]` **Increment 12 — Qualification and controlled launch**

## Material decisions intentionally still open

These are not implementation-agent choices. Stop before the affected production work:

- Production hosting region(s), every applicable jurisdiction/data-residency and
  cross-border assessment, and final account/environment ownership. Nigeria is one
  market profile, not an application-wide default.
- Production OIDC provider, tenant region, commercial terms, and privileged-user
  MFA/recovery policy (Increment 04B). The application identity boundary itself is
  vendor-neutral under ADR 0002.
- Managed durable queue and production observability providers.
- Paystack versus Flutterwave, commercial terms, settlement model, refund/dispute
  operations, and commission eligibility policy.
- Initial email provider, sending/data-processing region and domain; SMS and push are
  deferred. The privacy-safe content and consent policy was approved on 2026-10-02.
- Clinical terminology, retention/legal-hold policy, emergency access, and qualified
  clinical/privacy approvals.
- Production migration/cutover involving any real user, clinical, or financial data.

## Current implementation note

Increment 02 originally selected MinIO only for synthetic local development. Its archived
source build failed to reproduce during Increment 10, so the local-only Compose emulator
was replaced with pinned RustFS 1.0.0; this is not a production storage change. Production
object storage remains private Amazon S3 under ADR 0001. Docker Desktop became available
during Increment 10, and synthetic live storage and malware-scanner contracts were exercised.
The local emulator remains a flagged compatibility subset, not evidence of production S3
configuration or launch readiness.

Increment 03 was exercised against a disposable native PostgreSQL 18 instance because
Docker Desktop remained unavailable. CI now repeats migration and query-plan checks
against the pinned PostgreSQL 17.6 image. The prototype SQLite database remains
quarantined inside `apps/web`; its destructive `db:push --accept-data-loss` script was
removed and it is not a production data path.

Increment 04 is deliberately split. Increment 04A establishes and tests the complete
vendor-neutral trust boundary with synthetic identities. Increment 04B qualifies the
selected managed provider and remains visibly blocked on material human decisions.
The block does not prevent Increments 05–11 from using synthetic data after 04A, but it
does prevent real-user staging, identity migration, Increment 12, and public launch.

Increment 04A completed in `e978076`. The local synthetic OIDC provider and local-HTTP
cookie mode are test/development facilities only. Physical cleanup scheduling for
expired identity records is explicitly carried into the durable worker/retention work;
expired records are already rejected and indexed for cleanup. Increment 04B remains
separately blocked and mandatory.

Increment 05 completed in `a2fbd29`. Named policies now default deny and append every
protected decision to the immutable audit store. All unmigrated prototype APIs fail
closed in staging and production.

Increment 06 completed in `6a6fdfe`. Organization and practitioner discovery now use
durable PostgreSQL models, bounded public projections, stable cursor pagination,
representative query-plan gates, exact BFF allowlisting, and a generated OpenAPI client.
The practitioner profession/specialty seed is a broad canonical starting catalogue with
source metadata, not a substitute for qualified clinical governance; administrators can
extend and deactivate its records through the audited workflow delivered in Increment 07.
ADR 0003 now makes global deployability a standing invariant. Country-specific values
in prototype screens, legacy SQLite models, tests, or synthetic fixtures are not
production defaults and must be removed or routed through governed localization data as
each vertical slice migrates. New production work must not introduce an implicit
country, currency, locale, language, time zone, regulator, or regional provider.
Increment 07 completed in `13915dc` and `40090f4`. Its production onboarding and
administrative-verification path uses normalized application aggregates, append-only
history, administrator-only decisions, support review-only access, manager exclusion,
bounded keyset queues, exact BFF allowlisting, and generated contracts. Real document
upload/release remains fail-closed until Increment 10; qualified clinical catalogue
governance remains mandatory before real-data launch. Increment 08 completed in
`286f6d2`. It provides signed referral attribution, append-only corrections, governed
commission policy, privacy-safe earnings, and restricted support without manager access to
patient, payment, application, or organization private data. No live commission policy,
payment provider, payout workflow, banking data, or country/currency default was activated.
Increment 09 completed in `efcbf3f` and `82bfbd5`. The appointment and payment slice is
provider-neutral and remains synthetic: no live payment gateway, settlement account, refund
operation, commission eligibility policy, or production pricing was activated. Increment 10
now has a validated secure-file checkpoint, while production storage qualification and the
notification vendor, recipient, consent, content, and queue decisions remain explicit gates.
The deferred Increment 04B identity-provider decision remains a mandatory gate before
protected staging with non-synthetic users, real-user migration, Increment 12, or launch;
it does not block synthetic implementation and validation of Increments 06–11.
