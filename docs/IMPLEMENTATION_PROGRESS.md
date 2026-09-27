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
- `[~]` **Phase 1 — Engineering and infrastructure foundation.** Increment 01 is
  complete. Increment 02 is active. Managed cloud provisioning and deployment/restore
  evidence remain future work and require the relevant Phase 0 decisions.
- `[ ]` **Phase 2 — Identity, sessions, and authorization.** Delivered primarily by
  Increments 04–05.
- `[ ]` **Phase 3 — PostgreSQL domain foundation.** Delivered initially by Increment
  03 and extended by each later vertical slice.
- `[ ]` **Phase 4 — Production vertical slices and frontend connection.** Delivered by
  Increments 06–09 and 11.
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
- `[ ]` **Increment 03 — Database foundation**
- `[ ]` **Increment 04 — Managed identity and secure BFF session**
- `[ ]` **Increment 05 — Policy engine and audit boundary**
- `[ ]` **Increment 06 — Public discovery vertical slice**
- `[ ]` **Increment 07 — Onboarding and administrative verification**
- `[ ]` **Increment 08 — Manager attribution, earnings, and restricted support**
- `[ ]` **Increment 09 — Appointment and payment vertical slice**
- `[ ]` **Increment 10 — Files, notifications, and worker reliability**
- `[ ]` **Increment 11 — Remaining operational and clinical slices**
- `[ ]` **Increment 12 — Qualification and controlled launch**

## Material decisions intentionally still open

These are not implementation-agent choices. Stop before the affected production work:

- AWS deployment region, Nigerian data-residency/cross-border assessment, and final
  account/environment ownership.
- Managed OIDC provider and privileged-user MFA policy.
- Managed durable queue and production observability providers.
- Paystack versus Flutterwave, commercial terms, settlement model, refund/dispute
  operations, and commission eligibility policy.
- Email/SMS providers and approved sensitive-content policy.
- Clinical terminology, retention/legal-hold policy, emergency access, and qualified
  clinical/privacy approvals.
- Production migration/cutover involving any real user, clinical, or financial data.

## Current implementation note

Increment 02 deliberately uses MinIO only for synthetic local development. Production
object storage remains private Amazon S3 under ADR 0001. The upstream MinIO repository
is archived, so its pinned local source build is a flagged non-standard dependency and
must be reassessed before Increment 10. Docker Desktop is not currently running on the
implementation host; Compose can be statically validated, while live dependency-stack
evidence must be recorded when a Docker engine is available.
