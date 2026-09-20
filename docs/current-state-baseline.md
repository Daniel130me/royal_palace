# Current-State Baseline — Increment 00 Record

**Status:** Increment 00 deliverable, **revision 2** (protect the current baseline)

**Controlling specification:** `docs/PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md`

**Revision history**

| Rev | Captured from | Note |
| --- | --- | --- |
| 1 | `cf7331a` | Initial record. Rejected by product owner: captured before the hospital, patient-enrollment, support, manager-privacy, and patient-activity earnings work was integrated. |
| 2 | `6bbfa55` | **Current.** Regenerated after fast-forward synchronization to `origin/feat_prod` at `6bbfa55` (`feat(platform): add hospitals and referral-based manager flows`). Adds the new domain surface, corrects the migration map (referral attribution + minimal manager visibility), and cross-references ADR 0001. |

**Purpose:** Record the exact pre-migration state of this repository so that (a) no user
work is lost during the production migration, (b) pre-existing failures and risks are
separated from regressions introduced later, and (c) reviewers can trace every prototype
API route to a retirement increment. This document is an inventory only — it changes no
product behavior.

**Classification legend**

| Classification | Meaning |
| --- | --- |
| `replace` | Function survives to production, but the prototype trust model must be rebuilt (real sessions, server-derived identity, authorization policy, real payments, hashed credentials). |
| `retain temporarily` | Scoped read that may keep running behind the current gate until its vertical slice migrates; never internet-exposed as-is. |
| `remove` | Prototype mechanics that must not exist in production (generic CRUD, demo auth, stubbed endpoints). |

---

## 1. Environment snapshot (recorded 2026-09-20, revision 2)

### Git state at capture

| Item | Value |
| --- | --- |
| Repository root | `/home/z/my-project/royal_palace` (clone of `https://github.com/Daniel130me/royal_palace.git`) |
| Active branch | `feat_prod` (tracks `origin/feat_prod`) |
| HEAD at capture | `6bbfa55` `feat(platform): add hospitals and referral-based manager flows` (parent `9474f39`, the revision-1 baseline commit; synchronized with `git merge --ff-only`) |
| Worktree state | Clean before this revision; only gitignored artifacts added by verification (`node_modules/`, `.next/`) |
| Tracked files | 373 (55 files changed by `6bbfa55`: 3 new routes, 4 new models, 2 new lib modules, hospital/support/organization UI, reseeded demo DB) |

### Runtime versions

| Tool | Version |
| --- | --- |
| git | 2.47.3 |
| Node.js | v24.21.0 |
| bun (package manager of record — `bun.lock`) | 1.3.14 |
| TypeScript | ^5 (5.x via lockfile) |
| Next.js | ^16.1.1 (React ^19; `next dev` auto-appends an agent-rules block to `AGENTS.md`, mirrored by a one-line `CLAUDE.md` = `@AGENTS.md`) |
| Prisma | ^6.11.1 |
| ESLint | ^9 (`eslint-config-next` ^16.1.1) |
| Vitest | ^5.0.1 |

### Package manager and install discipline

- Lockfile of record: `bun.lock`. Install with `bun install --frozen-lockfile`
  (verified: 859 packages at this HEAD).
- No `pnpm-workspace.yaml` / Turborepo yet (monorepo split remains Increment 01 work).
- Target infrastructure per environment is now recorded in
  `docs/adr/0001-database-object-storage-and-environments.md` (Docker
  PostgreSQL/MinIO/ClamAV/Redis for development; RDS PostgreSQL Single-AZ + private S3
  for shared staging; RDS PostgreSQL Multi-AZ + private S3 + CMK + GuardDuty malware
  protection for production; Aurora deferred; AWS region and the NDPA cross-border
  assessment are approval-gated open decisions).

### Commands of record (pre-migration baseline)

| Purpose | Command |
| --- | --- |
| Install | `bun install --frozen-lockfile` |
| Dev server | `bun run dev` (Next.js on :3000; pipes through `tee dev.log`) |
| Type check (strict CLI) | `npx tsc --noEmit` |
| Lint | `bun run lint` (`eslint .`) |
| Tests | `bun run test` (`vitest run`) |
| Production build | `bun run build` (`next build` + `cp -r` of static/public into standalone) |
| DB sync (PROTOTYPE ONLY) | `bun run db:push` → `prisma db push --accept-data-loss` — must never be used in production |
| DB seed (demo data) | `bun run db:seed` (`bun prisma/seed.ts`) |

### Environment assumptions

- `.env` (tracked in git, contains no secret today) holds a single value:
  `DATABASE_URL=file:../db/custom.db` — a committed SQLite file (815 KB, reseeded by
  `6bbfa55` with hospital/enrollment/earnings demo rows, plaintext demo passwords).
  `.gitignore` lists `.env*`, but `.env` was committed before ignoring took effect, so
  it remains tracked.
- `db/custom.db` is committed demo/synthetic data and must never be promoted to
  production (plan §27.11).
- `.zscripts/*.sh` assume Linux + bun + Caddy and package the SQLite DB into deploy
  artifacts; they are deployment plumbing for the prototype hosting environment, not a
  production deployment path.

---

## 2. Baseline quality-gate results (at `6bbfa55`)

All gates were run on the clean synchronized worktree before any revision-2 edits.

| Gate | Command | Result |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | PASS (859 packages) |
| Type check | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `bun run lint` | PASS (exit 0, no findings) |
| Tests | `bun run test` | PASS — 24/24 tests in 2 files (`tests/unit/manager-constants.test.ts`: 14, `tests/integration/manager-earnings-policy.test.ts`: 10, DB-backed) |
| Production build | `bun run build` | PASS — compiled successfully in 18.9 s, exit 0 |

**Known pre-existing failures: none.** All verification gates are green at `6bbfa55`.

**Pre-existing quality risks (recorded now; remediated by later increments, NOT this one):**

1. `next.config.ts` sets `typescript.ignoreBuildErrors: true` — type errors do not block
   `next build` even though the CLI `tsc --noEmit` is clean today. (Increment 01 removes it.)
2. `tsconfig.json` sets `strict: true` but weakens it with `noImplicitAny: false`;
   `tests/` and `examples/` are excluded from the project.
3. `eslint.config.mjs` disables ~27 rules, including `@typescript-eslint/no-explicit-any`,
   `no-unused-vars`, `react-hooks/exhaustive-deps`, `no-console`, `no-debugger`.
4. No Prisma migrations directory exists; schema sync relies on
   `prisma db push --accept-data-loss` (forbidden in production by plan §6).
5. No `middleware.ts`; authentication remains opt-in per route (see §4.3).
6. Test coverage is still limited to manager-module constants and the legacy
   org-payment earnings policy; the new patient-activity earning path, enrollment
   flows, and hospital discovery have **no tests** (`tests/` unchanged by `6bbfa55`).
7. `package.json` scripts are OS-specific (`cp -r`, `tee`, inline `NODE_ENV=`).
8. `next-auth` is installed but unused (no NextAuth code in `src/`).
9. `next dev` auto-manages a rules block appended to `AGENTS.md` (and a one-line
   `CLAUDE.md` pointing at it). This is tooling-generated; the human-owned standards
   in `AGENTS.md` remain authoritative above the block.

---

## 3. API route inventory and classification (48 route handlers)

Grouped by route family. “Auth mechanism” names the helper or notes absence. The root
defect is unchanged: **identity is client-asserted** — either via the unsigned
`x-rp-session` header (a client-controlled JSON blob `{userId, role, profileId}`) or
via actor/patient/organization fields in the request body. The session helpers verify
only that the referenced user row exists and is active; they cannot detect a forged
header because the header itself is the bearer credential. `6bbfa55` adds a third
helper, `getSupportOrAdminContext` (role ∈ `support | admin`), built on the same
header, and one new public intake route that authenticates via the manager
`onboardingCode` shared secret instead of a session.

### 3.1 Auth (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | Validate credentials, return session JSON for localStorage | Credential check vs `User` table | N (credentials checked) — but issues unsigned client-held session | **Plaintext password comparison** (`user.password !== password`); unsigned session blob, no expiry/signature | replace | Identity & Access (Incr. 04) |
| `/api/actions/signup` | POST | Public patient self-signup; **now accepts `onboardingCode`** — referred patients are created `status:"pending"` with `acquiredByManagerId`, `onboardingStatus:"pending"`, and a `ManagerPatientApplication` row; direct signups stay active | None (public by design) | Y — all identity fields from body | **Plaintext password stored**; fake DOB/city defaults; returns full patient row; weak shared-secret attribution | replace (re-noted) | Identity & Access + Manager Attribution (Incr. 04/08) |

### 3.2 Generic resource layer (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/resources/[collection]` | GET, POST | Generic list/create; **now also exposes `hospital` and `hospitalService` collections** (hospital GET forced to `verificationStatus:"approved"`) | **None** | Y — everything client-controlled | **Unauthenticated read/create of all data** (incl. `user` rows → plaintext passwords, payments, audit logs, consents); arbitrary `where` from query params; hospital rows returned **without field projection** (email/phone/rating/acquisition exposed) | remove (re-noted) | Cross-cutting — forbidden by plan §23; hospital discovery must move to `/v1/public/hospitals` (Incr. 06) |
| `/api/resources/[collection]/[id]` | GET, PATCH, DELETE | Generic fetch/update/delete any row by id; **hospital/hospitalService writes blocked** (403, admin-only message); non-approved hospital GET returns 404 | **None** | Y — everything client-controlled | **Unauthenticated update/delete of any row** except the new hospital guards; business logic (manager payout settlement) embedded in generic PATCH | remove (re-noted) | Cross-cutting — superseded by per-domain endpoints |

### 3.3 `actions/*` — patient, clinical, pharmacy, laboratory, logistics (19 routes, ungated)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/book-appointment` | POST | Create appointment + payment; **now also records a `PatientActivityPayment` (`activityType:"consultation"`) and derives a manager earning in the same transaction** via `recordPatientActivityPayment` | None | Y — `patientId`, `providerId`, `method` from body | **Simulated payment success** (`DEMO-PAY` ref, appointment pre-marked `paid`); earning eligibility enforced server-side (approved + attributed patients only) | replace (re-noted) | Scheduling & Consultation + Payments & Ledger (Incr. 09) |
| `/api/actions/progress-appointment` | POST | Appointment status transitions | None | Y — `actorId`/`actorRole` from body into audit log | Unauthenticated write; audit actor client-asserted | replace | Scheduling & Consultation (Incr. 09) |
| `/api/actions/start-encounter` | POST | Open clinical encounter | None | Y — `actorId` from body | Unauthenticated clinical write | replace | Clinical Encounters (Incr. 11) |
| `/api/actions/complete-encounter` | PATCH | Lock/sign encounter, complete appointment | None | Y — `actorId` from body | Unauthenticated clinical write; signing has no verified signer identity | replace | Clinical Encounters (Incr. 11) |
| `/api/actions/issue-prescription` | POST | Create prescription + items | None | Y — `patientId`, `providerId`, `actorId` from body | Unauthenticated clinical write (anyone can issue Rx as any provider) | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/upload-prescription` | POST | Patient uploads paper Rx image | None | Y — `patientId` from body | **Base64 file stored in DB** (`UploadedPrescription.dataUrl`); no size/type validation | replace | Prescriptions & Pharmacy + Files (Incr. 10/11) |
| `/api/actions/create-referral` | POST | Provider-to-provider referral + access grant | None | Y — both provider ids from body | Unauthenticated write; creates access grant without patient consent check | replace | Consent & Access (Incr. 11) |
| `/api/actions/revoke-access` | POST | Patient revokes record-access grant | None | Y — caller not verified; `actorId` from body | Unauthenticated write | replace | Consent & Access (Incr. 11) |
| `/api/actions/create-lab-request` | POST | Provider orders lab tests | None | Y — `requestingProviderId`, `actorId` from body | Unauthenticated clinical write | replace | Laboratories (Incr. 11) |
| `/api/actions/book-lab` | POST | Patient books lab for a request; **now also records a `PatientActivityPayment` (`activityType:"laboratory"`)** | None | Y — `actorId` from body; **price from body** (`Number(price ?? 5000)`) | **Simulated payment** (`paymentStatus:"paid"`); client-set price flows into both `LaboratoryBooking.price` and the activity payment amount | replace (re-noted) | Laboratories (Incr. 11) |
| `/api/actions/progress-lab` | POST | Lab booking status transitions | None | Y — `actorId` from body | Unauthenticated write | replace | Laboratories (Incr. 11) |
| `/api/actions/publish-lab-result` | POST | Lab publishes result | None | Y — `laboratoryId`, `actorId` from body | Unauthenticated clinical write | replace | Laboratories (Incr. 11) |
| `/api/actions/create-pharmacy-order` | POST | Patient sends Rx to pharmacy; **now records `PatientActivityPayment` (`activityType:"pharmacy"`)** | None | Y — `patientId`, `actorId`, **item prices** from body | **Simulated payment**; unit prices trusted from client; delivery hardcoded to `LOG-001` | replace (re-noted) | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/direct-pharmacy-order` | POST | OTC order without prescription; **now records `PatientActivityPayment`** | None | Y — `patientId`, `actorId` from body | **Simulated payment**; delivery hardcoded to `LOG-001` | replace (re-noted) | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/progress-order` | POST | Pharmacy order status transitions | None | Y — `actorId` from body | Unauthenticated write | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/progress-delivery` | POST | Delivery status transitions | None | Y — `actorId` from body; verification code delivered to client | Unauthenticated write; verification code visible on order records | replace | Logistics (Incr. 11) |
| `/api/actions/request-payout` | POST | Provider/pharmacy/lab/logistics payout request | None | Y — `entityType`/`entityId`/`amount` from body | **Unauthenticated money-movement request for any entity, any amount**; no balance validation | replace | Settlements & Payouts (Incr. 11) |
| `/api/actions/mark-notification-read` | POST | Mark notification(s) read | None | Y — `allFor` recipientId from body | Unauthenticated; can mark any user's notifications read | replace | Notifications (Incr. 10) |

### 3.4 `actions/*` — admin, manager, and enrollment mutations (11 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/admin-assign-manager` | POST | Assign/reassign org to manager (tx + reason) | `getAdminContext` (`x-rp-session`) | Y — unsigned client header | Header trust model only; superseded by acquisition attribution model | replace | Manager Attribution (Incr. 08) |
| `/api/actions/admin-manager-rule` | POST | Create/retire revenue-share rules; **now scoped by `activityType`** (`consultation \| pharmacy \| laboratory \| hospital`) instead of organization/transaction pair; overlap check on `activityType` | `getAdminContext` | Y — unsigned client header | Header trust model only; two rule vocabularies now coexist (legacy `ELIGIBLE_TRANSACTION_TYPES` still referenced by the org-payment earning path) | replace (re-noted) | Manager Attribution (Incr. 08) |
| `/api/actions/admin-review-manager-application` | POST | Approve/reject org application; **approval no longer creates a manager assignment** — it creates the organization (pharmacy/laboratory/**hospital** with services) with `acquiredByManagerId` attribution, `verificationStatus:"approved"` | `getAdminContext` | Y — unsigned client header | **Hardcoded demo password `demo123`** on approval-created org users (code comment flags prototype-only); orgs born approved | replace (re-noted) | Organizations & Credentialing + Manager Attribution (Incr. 07/08) |
| `/api/actions/admin-review-patient-enrollment` | POST **(NEW)** | Admin decision on `ManagerPatientApplication`: `under_review \| information_required \| approved \| rejected`; in one transaction updates application + `Patient.onboardingStatus` + `User.status`; writes AuditLog; notifies the attributing manager | `getAdminContext` | Y — unsigned client header | No status guard (re-decision of a reviewed application not blocked); reviewer identity from unsigned `session.profileId` | replace **(NEW)** | Manager Attribution + Identity & Access (Incr. 08) |
| `/api/actions/submit-manager-enrollment` | POST **(NEW)** | **Public organization self-submission** through a manager's attributed link: creates `ManagerOrganizationApplication` (`status:"submitted"`, services capped at 50); hospital applications require a non-empty services list | **None** — authenticates the link via manager `onboardingCode` (must be `verified`) | Y — all organization fields from body; code is a weak shared secret | No rate limit, no idempotency (repeat POSTs duplicate applications); no AuditLog write; contact email never checked for an existing user; notification to hardcoded `ADM-001` | replace **(NEW)** | Organizations & Credentialing intake (Incr. 07) |
| `/api/actions/admin-update-pricing` | POST | New ServicePrice version | **None** (`actorId` from body, default `"ADM-001"`) | Y | **Admin action with zero auth** | replace | Hospital Discovery pricing (Incr. 06) |
| `/api/actions/admin-pharmacy-commission` | POST | Set pharmacy commission % | **None** (`actorId` from body, default `"ADM-001"`) | Y | **Admin action with zero auth** | replace | Payments & Ledger commercial terms (Incr. 11) |
| `/api/actions/admin-verify-provider` | POST | Approve/reject/suspend/reactivate provider | **None** (`actorId` from body, defaults `"ADM-001"`/`"USR-ADMIN"`) | Y | **Admin action with zero auth** (self-approval possible) | replace | Organizations & Credentialing (Incr. 07) |
| `/api/actions/confirm-organization-payment` | POST | Admin records org payment + derives manager earning (tx, idempotent on reference) | `getAdminContext` | Y — unsigned client header | **Simulated payment** (admin asserts bank transfer; no PSP/reconciliation) — legacy earning path, now coexists with the patient-activity path | replace | Payments & Ledger (Incr. 09) |
| `/api/actions/refund-organization-payment` | POST | Full/partial refund + ledger reversal (tx) | `getAdminContext` | Y — unsigned client header | Admin-asserted refund (no provider event); does **not** reverse patient-activity earnings (gap) | replace | Payments & Ledger (Incr. 09) |
| `/api/actions/manager-onboard-organization` | POST | Manager submits org application (legacy direct-onboarding path) | `getManagerContext` | Y — unsigned client header | **Orphaned**: its UI caller was deleted by `6bbfa55` (manager onboard page is now link-only); header comment (“first assignment”) is stale; still accepts pharmacy/laboratory only | replace | **Retire** — superseded by `submit-manager-enrollment` self-submission (Incr. 07) |

### 3.5 `actions/*` — manager mutations (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/manager-request-payout` | POST | Payout request: balance re-validation, FIFO ledger allocation, tx | `getManagerContext` + verified bank account required | Y — unsigned client header | Header trust model only (best-engineered money route in the prototype) | replace | Settlements & Payouts (Incr. 11) |
| `/api/actions/manager-update-ticket` | POST | Manager support actions — **reduced to `follow_up` and `escalate` only**; every manager message is written `visibility:"admin_internal"`; escalate sets `status:"escalated_to_royal_palace"` | `getManagerContext`; ticket scope via `findFirst({id, managerId})` | Y — unsigned client header | Header trust model only; `reply/request_info/resolve` actions and org notifications removed | replace (re-noted) | Support (Incr. 08) |

### 3.6 `admin/*` reads (3 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/manager-data` | GET | Admin oversight: rules, ledger totals, payouts, applications, escalations; **now merges patient enrollment applications** (patient name/email/phone visible to admin) | `getAdminContext` | Y — unsigned client header | Display-only reads; header trust model | retain temporarily (re-noted) | Manager Attribution (Incr. 08) |
| `/api/admin/managers` | GET | Manager directory with enrollment/ticket counts | `getAdminContext` | Y — unsigned client header | Header trust model | retain temporarily | Manager Attribution (Incr. 08) |
| `/api/admin/managers/[id]` | GET | Single manager detail (portfolio, history, totals) | `getAdminContext` | Y — unsigned client header | Exposes `onboardingCode` (weak shared secret) in response; still the only consumer of the `PHARMACY_SELECT`/`LABORATORY_SELECT` projections | retain temporarily | Manager Attribution (Incr. 08) |

### 3.7 `manager/*` reads (9 routes — visibility narrowed by `6bbfa55`)

| Route | Method | Purpose | Extra scoping | Notes | Classification |
| --- | --- | --- | --- | --- | --- |
| `/api/manager/me` | GET | Own manager profile, masked bank account; **`enrollmentCount` (attributed patients/orgs) replaces `portfolioCount`; pending patient + org application counts** | — | Account number masked server-side | retain temporarily (narrowed) |
| `/api/manager/dashboard` | GET | **Rebuilt**: enrollment counts by type (patients/pharmacies/laboratories/hospitals, pending/approved), earning aggregates (`thisMonth/pending/available/paid/reversed`), payout availability, open support tickets, 6-month/7-day earning series, 5 notifications. **No organization records and no organization payment data remain.** | — | 4 `count` + 2 `groupBy` + bounded series queries (no per-row follow-ups) | retain temporarily (narrowed) |
| `/api/manager/applications` | GET | **Status-only enrollment references** (org + patient merged, `enrollmentType` tag); select allowlist `{id, applicationNumber, organizationType, status, submittedAt, createdAt, reviewedAt, reviewerNote}`; search/type filters and business names removed | — | Sliced to page size | retain temporarily (narrowed) |
| `/api/manager/earnings` | GET | **Narrowed projection**: `{id, earningNumber, amount, entryType, status, occurredAt}` + `activityType` + payout reference/status; **`eligibleAmount`/`rateBps`/organization data no longer returned**; status totals + pagination meta | — | Header comment: “Gross payments, identities and commission rates never leave this endpoint.” | retain temporarily (narrowed) |
| `/api/manager/payouts` | GET | Own payout requests, available balance, masked bank details | — | Unchanged | retain temporarily |
| `/api/manager/support` | GET | **Ticket references only**: `{id, ticketNumber, displayName, category, status, lastActivityAt}` | — | Messages excluded | retain temporarily (narrowed) |
| `/api/manager/support/[id]` | GET | Ticket detail, 6-field projection + `escalationDepartment`; **messages no longer included**; scope via `findFirst({id, managerId})` | — | `assertTicketInPortfolio` no longer used | retain temporarily (narrowed) |
| `/api/manager/organizations` | GET | **Now a 403 stub**: always returns `{ error: "Organization records are available only to support and admin staff." }` | — | Deliberate boundary change in `6bbfa55` | **remove** (reclassified) |
| `/api/manager/organizations/[id]` | GET | **1-line re-export of the 403 stub** | — | Full org DTOs no longer reachable by managers | **remove** (reclassified) |

All `retain temporarily` manager reads remain gated by `getManagerContext` from the
unsigned `x-rp-session` header. Future module for all: Manager Attribution / Support /
Settlements & Payouts (Incr. 08/11).

### 3.8 `support/*` reads (1 route — new)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/support/enrollments` | GET **(NEW)** | Support/admin bulk enrollment view: patients, pharmacies, laboratories, hospitals (4 unbounded `findMany`, `createdAt desc`) incl. identity fields (`email`, `phone`, city/state, status, `acquiredByManagerId`); hospitals include active services | `getSupportOrAdminContext` (new helper; role not used to differentiate payload) | N (read) | **Unbounded bulk PII read, no pagination, no masking, no access audit**; support and admin visibility identical; hospital scalars unprojected | retain temporarily **(NEW)** | Support (Incr. 08 — must gain pagination, masking policy, and read auditing) |

### 3.9 Tally and retirement mapping

| Classification | Count | Movement vs revision 1 | Retirement path |
| --- | --- | --- | --- |
| `replace` | 33 | +2 new routes; 10 materially re-noted | Trust-model rebuild per module through Increments 04–11 |
| `retain temporarily` | 11 | +1 new (`support/enrollments`); 7 narrowed; `admin/manager-data` extended | Replaced route-by-route during Increment 08 slices |
| `remove` | 4 | `manager/organizations` + `[id]` reclassified retain→remove (now 403 stubs) | Delete stubs in Increment 08; generic resources layer deleted after Increments 06–09 coverage |
| **Total** | **48** | 45 → 48 | — |

---

## 4. Cross-cutting architecture findings (server side, at `6bbfa55`)

1. **Session helpers:** `src/lib/manager-access.ts` — `getManagerContext(req)`,
   `getAdminContext(req)`, and the **new** `getSupportOrAdminContext(req)` parse the
   unsigned `x-rp-session` header and load the `User` row (existence/active status
   only; the header itself is client-controlled). `assertOrganizationInPortfolio` and
   `assertTicketInPortfolio` are now **dead code** (no callers — manager routes moved
   to direct `findFirst({id, managerId})` scoping). `PHARMACY_SELECT`/
   `LABORATORY_SELECT` projections survive only for `/api/admin/managers/[id]`.
2. **Session issuance/transport:** unchanged — created by `/api/auth/login` and
   `/api/actions/signup`; stored client-side under localStorage key
   `royalPalaceSession`; attached verbatim as the `x-rp-session` header by
   `sessionHeaders()` in `src/lib/api-client.ts`. Plain JSON — no token, signature,
   or expiry; logout removes the localStorage key only (no server-side revocation).
3. **No shared auth middleware:** still no `middleware.ts`. Auth remains opt-in per
   route; 16 of 48 routes call a session helper; the rest verify nothing.
4. **Passwords:** plaintext throughout — direct compare at `login`, raw persistence at
   `signup`, `demo123` on approval-created org users (`admin-review-manager-application`,
   with a code comment flagging prototype-only), `demo123` for all seed accounts
   including the new `support@demo.com` and `lagoonhospital@demo.com`.
5. **Audit:** patient-enrollment decisions now write `AuditLog` rows
   (`patient_enrollment_<action>`); organization-application review retains its audit
   writes; `submit-manager-enrollment` (public intake) and `support/enrollments` (bulk
   PII read) write **no** audit events. Most ungated routes still pass
   client-asserted `actorId`/`actorRole` (or defaults like `"ADM-001"`) into `audit()`.
6. **Two earning derivation paths now coexist** (single-policy decision required in
   Increment 08): the legacy org-payment path (`src/lib/manager-earnings-policy.ts` +
   `confirm-organization-payment`/`refund-organization-payment`, eligibility via
   `ELIGIBLE_TRANSACTION_TYPES`) and the new patient-activity path
   (`src/lib/manager-patient-earnings.ts`, eligibility via `activityType`-scoped
   `ManagerRevenueShareRule` rows + `patient.acquiredByManagerId` +
   `onboardingStatus:"approved"`).
7. **Patient-activity earning mechanics** (`src/lib/manager-earnings.ts` module):
   idempotent on unique `reference`; earning `eventKey` = `patient-activity:<PAP id>`;
   rule lookup `managerId + activityType + active + effectiveFrom ≤ occurredAt <
   effectiveUntil` (latest first); earning born `status:"available"` and immediately
   payout-eligible (unlike org-payment earnings, which mature); integer bps math with
   input validation (`calculateManagerEarning`).
8. **Simulated payments persist everywhere**: `DEMO-PAY` references, payments born
   `status:"successful"` at write time, `paymentStatus:"paid"` on lab bookings,
   admin-asserted organization payments. No PSP, webhook, or reconciliation path
   exists. Refunds of org payments do not reverse patient-activity earnings (gap).
9. **Reusable domain logic (candidate to preserve through migration):** manager
   earnings math and policy guards, the `canTransition*` state guards in
   `src/lib/format.ts`, and the new enrollment state machines
   (`ManagerPatientApplication` and `ManagerOrganizationApplication` statuses).
10. **Base64 clinical upload:** unchanged — `UploadedPrescription.dataUrl` stores a
    full base64 data URL in SQLite and returns it verbatim in responses.
11. **DB client:** unchanged — Prisma singleton over SQLite with `log: ['query']`
    enabled; **no new middleware**; IDs remain app-generated human strings via
    `genId()` rather than opaque server UUIDs (plan §21).
12. **Money convention:** still integer whole-naira everywhere; `PatientActivityPayment`
    adds `currency @default("NGN")` — a step toward plan §21, but the minor-units
    (kobo) decision and ISO 4217 validation remain open. Only non-money `Float`s
    remain (ratings, height/weight, `commissionPct`).

---

## 5. Prototype risk inventory (client side, data layer, tooling)

### 5.1 localStorage / sessionStorage keys (unchanged by `6bbfa55`)

| Key | File(s) | Stored | Trust / blast radius |
| --- | --- | --- | --- |
| `royalPalaceSession` | `src/lib/nav.ts`, `src/lib/api-client.ts` | Full session JSON `{userId, role, profileId, name, email}` | Sent verbatim as `x-rp-session` header; role gates portal routing client-side only |
| `managerNotificationPrefs` | `src/features/manager/pages/settings.tsx` | Notification-channel UI preferences | Local UI only |
| `royalPalaceAdminSettings` | `src/features/admin/pages/settings.tsx` | Currency, support contacts, commission/margin defaults, maintenance toggle | Local UI only — NOT persisted to DB |

sessionStorage: zero usages. Zustand `persist`: not used.

### 5.2 Client session/identity flow (updated)

- `sessionHeaders()` (`src/lib/api-client.ts`) attaches `royalPalaceSession` verbatim
  as `x-rp-session` for `sessionApi`/`action()` wrappers; plain `api`/`resource`
  helpers attach nothing and hit ungated routes.
- **New:** `src/features/auth/organization-signup-page.tsx` (public) reads
  `?code=<onboardingCode>&type=<pharmacy|laboratory|hospital>` from the URL and posts
  the organization's own data to `submit-manager-enrollment`. Referral links are
  built client-side in `src/features/manager/pages/onboard.tsx`
  (`${origin}/#/login/signup?code=…`, `${origin}/#/login/organization-signup?code=…&type=…`).
  Managers only copy/distribute links — they never submit applicant data (page text:
  “Managers do not collect or edit enrollment data. They only share attributed
  links.”).
- `signup-page.tsx` shows the referred-patient flow and, on `pendingReview`, navigates
  to login **without** creating a client session.
- `src/lib/nav.ts` adds `hospital` and `support` portals (role → portal mapping
  unchanged, cosmetic enforcement only).

### 5.3 Plaintext/default credentials (updated)

All seed accounts use password **`demo123`** (plaintext, compared directly at login).
`6bbfa55` adds two accounts: `support@demo.com` (role `support`) and
`lagoonhospital@demo.com` (role `hospital`). Approval-created organization users are
still created with hardcoded `demo123`.

| Role | Emails |
| --- | --- |
| admin | `admin@demo.com` |
| support | `support@demo.com` |
| patient | `amina@demo.com` |
| doctor | `doctor@demo.com`, `doctor2@demo.com`, `doctor3@demo.com` |
| pharmacy | `pharmacy@demo.com`, `sunrise@demo.com`, `wellness@demo.com` |
| laboratory | `lab@demo.com`, `ikejacentral@demo.com` |
| hospital | `lagoonhospital@demo.com` |
| logistics | `logistics@demo.com` |
| manager | `manager@demo.com`, `manager2@demo.com` (onboarding codes `MGR00128`/`MGR00129`) |

Login is email+password only. Referred patients (`status:"pending"`) cannot log in
until an admin approves their enrollment — a genuine improvement, but the credential
model underneath is unchanged.

### 5.4 Demo/mock fallbacks

- Unchanged: silent `.catch(() => [])` error swallowing in patient/provider/pharmacy
  contexts; `encounter.tsx` `addMockAttachment()` fabricating clinical attachments;
  `result-new.tsx` mock upload metadata; simulated video consultation; UI banners
  (“Synthetic data · Simulated services”).
- Updated: `direct-pharmacy-order` still hardcodes `logisticsProviderId: "LOG-001"`.
- Manager `transactions.tsx` still exists but now displays “Confidential” for
  eligible amount and rate (dead-ish page — see §7).

### 5.5 Simulated payment paths (updated)

| Path | Mechanism |
| --- | --- |
| `book-appointment` | Appointment pre-marked `paid`; `Payment` auto-`successful` (`DEMO-PAY` ref); **additionally** creates `PatientActivityPayment` `status:"successful"` + earning in-tx |
| `book-lab` | `paymentStatus:"paid"`; client-set price (default 5000) also becomes the `PatientActivityPayment.amount` |
| `create-pharmacy-order` / `direct-pharmacy-order` | `paymentStatus:"paid"` at creation + activity payment from client-supplied totals |
| `confirm-organization-payment` | Admin asserts a bank transfer; successful `OrganizationPayment` + legacy earning in one tx (idempotent on reference) |
| `refund-organization-payment` | Admin-asserted refund + clamped legacy earning reversal (does not touch patient-activity earnings) |
| `resources/[collection]/[id]` PATCH | Any client can flip `payoutRequest.status` to `paid`, settling manager earnings |
| Schema | `Payment.status` and `PatientActivityPayment.status` default to `"successful"` |

### 5.6 Base64 upload/storage paths (unchanged)

Client `readAsDataURL` in `upload-prescription.tsx` → `UploadedPrescription.dataUrl`
stored in SQLite, rendered via `<img src={dataUrl}>`. No other `FileReader` usages.

### 5.7 Prisma schema summary (46 models, SQLite)

- Datasource `sqlite`, `DATABASE_URL=file:../db/custom.db`, no migrations directory.
- **42 models from revision 1 plus 4 new:** `Hospital`, `HospitalService`,
  `ManagerPatientApplication`, `PatientActivityPayment`.
- **Hospital models:** `Hospital` (`userId @unique`, `hospitalNumber @unique`,
  `verificationStatus @default("pending")`, `rating Float`, `acquiredByManagerId`,
  indexes `[acquiredByManagerId, verificationStatus]`, `[state, city,
  verificationStatus]`); `HospitalService` (`@@unique([hospitalId, name])`, indexes
  `[category, active]`, `[hospitalId, active]`, `active @default(true)`). Hospitals
  are created **only** by admin approval; hospital-role UI is read-only.
- **ManagerPatientApplication:** one per patient (`patientId @unique`), statuses
  `submitted | under_review | information_required | approved | rejected`, reviewer
  fields, indexes `[managerId, status]`, `[status, submittedAt]`.
- **PatientActivityPayment:** `reference @unique`, `paymentNumber @unique`,
  `activityType` (`consultation | pharmacy | laboratory | hospital`),
  `amount Int`, `currency @default("NGN")`, `status` (`successful | refunded`),
  refund fields, indexes `[patientId, occurredAt]`, `[activityType, status,
  occurredAt]`; schema comment states Manager APIs never expose patient identity,
  gross amount, or payment reference.
- **ManagerRevenueShareRule:** `activityType` column + `@@index([managerId,
  activityType, status])` added; `ManagerEarning.organizationPaymentId` now optional
  and `patientActivityPaymentId String?` added (both earning paths supported).
- **Patient:** `acquiredByManagerId`, `acquiredAt`, `onboardingStatus` added.
- Constraint gaps carried forward: free-text `User.role` (now also `hospital`,
  `support` in practice), `profileId` not a FK, polymorphic `PayoutRequest.entityId`,
  non-FK `Notification.recipientId` / `AuditLog.actorId` / `SupportTicket.organizationId`,
  plaintext `ManagerBankAccount.accountNumber`, `String` date fields,
  JSON-in-String columns, no enums (SQLite), and `UploadedPrescription.dataUrl` blob.

### 5.8 Scripts, CI, and tooling (updated)

- `.zscripts/*.sh` and `package.json` script OS-specificity: unchanged from
  revision 1 (see §1 “Commands of record”; risks in §2).
- Tests: still 2 Vitest files / 24 cases; **zero tests cover the new hospital,
  enrollment, support, or patient-activity earning code**.
- `AGENTS.md`: the human-owned standards remain at the top; `next dev` (Next 16)
  auto-appends and maintains an agent-rules block, and a one-line `CLAUDE.md`
  (`@AGENTS.md`) references it. Both were committed by `6bbfa55` to keep the tree
  clean.
- No CI configuration exists (no `.github/workflows/`).

---

## 6. Migration map — prototype surface → owning future module (corrected)

Plan §7 module order and §19 increment order are authoritative. **Revision-2
correction per product-owner instruction:** the manager model is **referral
attribution + minimal visibility**. Managers distribute signed referral links;
applicants (patients and organizations) submit their own data; direct manager
onboarding and manager portfolio/full-organization access are retired or replaced,
never rebuilt.

| Future module (plan §7) | Prototype surface retired | Target increment |
| --- | --- | --- |
| Identity & Access | `/api/auth/login`, `/api/actions/signup` (referral capture rebuilt on real identity), `royalPalaceSession` key, plaintext passwords, `x-rp-session` trust | 04 |
| Policy engine & audit boundary | Ad-hoc `getManagerContext`/`getAdminContext`/`getSupportOrAdminContext`, client-asserted audit actors, unaudited support reads | 05 |
| Hospital Discovery | **New:** `Hospital`/`HospitalService` public reads currently served through the generic resources layer (unprojected rows, client-side filtering, unbounded list) → replaced by `/v1/public/hospitals` + `/v1/public/services` with bounded filters, cursor pagination, and public-safe projections; `/api/actions/admin-update-pricing` | 06 |
| Organizations & Credentialing | **New:** organization **self-onboarding** (`organization-signup-page`, `submit-manager-enrollment` — needs idempotency, rate limits, audit), admin approval branch incl. hospital creation, `admin-verify-provider`, `admin-pharmacy-commission` | 07 |
| Manager Attribution (referral) | **Corrected:** referral attribution primitives (`Manager.onboardingCode`, `acquiredByManagerId`, `ManagerPatientApplication`, enrollment-status views) survive as inputs to the real signed-referral-link + immutable-attribution design; **direct manager onboarding retired**: `manager-onboard-organization` route (already orphaned) is deleted, manager-submitted organization data is never reintroduced; managers distribute links, applicants self-submit | 08 |
| Manager visibility (minimal) | **Corrected:** manager **portfolio/full-organization access retired**: `manager/organizations` + `[id]` (already 403 stubs) deleted in Increment 08; dashboard portfolio/org-payment cards already removed; earnings stay aggregate-only (`eligibleAmount`/`rateBps`/gross payments never returned); support stays ticket-reference-only with `follow_up`/`escalate` | 08 |
| Support | **New:** support enrollment review workspace (`support/enrollments`, `support-portal.tsx`) — retain read-only separation (approval stays admin-only) but add pagination, masking policy, and read auditing; `manager-update-ticket` rebuilt with real identity | 08 |
| Scheduling & Consultation + Payments & Ledger | `book-appointment`, `progress-appointment`, simulated payments (`DEMO-PAY`), `confirm-organization-payment`, `refund-organization-payment` | 09 |
| Payments & Ledger (earnings) | **New:** `PatientActivityPayment` recording + `recordPatientActivityPayment` moved behind verified payment webhooks (today payments are simulated at write time); two earning paths (legacy org-payment vs patient-activity) unified into one versioned policy; lab price-from-client and client-supplied pharmacy totals replaced by server-side pricing; org-payment refunds extended to reverse patient-activity earnings | 09 (with 08) |
| Files, Notifications & worker | `upload-prescription` (base64), `mark-notification-read`, silent `.catch(() => [])` fallbacks | 10 |
| Prescriptions & Pharmacy | `issue-prescription`, `create-pharmacy-order`, `direct-pharmacy-order`, `progress-order` | 11 |
| Laboratories | `create-lab-request`, `book-lab`, `progress-lab`, `publish-lab-result` | 11 |
| Logistics | `progress-delivery`, hardcoded `LOG-001` delivery | 11 |
| Clinical Encounters + Consent & Access | `start-encounter`, `complete-encounter`, `create-referral`, `revoke-access`, mock attachments in encounters | 11 |
| Settlements & Payouts | `request-payout`, `manager-request-payout`, `manager/payouts`, generic PATCH payout settlement, plaintext bank accounts | 11 |
| Cross-cutting removal | `/api/resources/[collection](/[id])` generic CRUD (incl. the temporary `hospital`/`hospitalService` collections added by `6bbfa55`) | After Increments 06–09 cover all consumers; deleted no later than Increment 11 |

**Recorded gap:** patient-activity earning rules already include
`activityType:"hospital"` (seed rule MRR-009), but no route produces hospital activity
payments yet. When hospital booking arrives, it must use the same
verified-payment + attribution pipeline, not a new path.

---

## 7. Dead / orphaned code inventory (new in revision 2)

Safe-deletion candidates recorded now so later increments retire them deliberately:

1. `src/app/api/actions/manager-onboard-organization/route.ts` — no UI caller since
   `6bbfa55`; stale header comment still says approval creates a first assignment.
2. `assertOrganizationInPortfolio` / `assertTicketInPortfolio` in
   `src/lib/manager-access.ts` — no callers.
3. `PHARMACY_SELECT` / `LABORATORY_SELECT` — consumed only by
   `/api/admin/managers/[id]` after manager org detail was stubbed.
4. `src/features/manager/pages/transactions.tsx` — renders “Confidential” placeholders
   for amounts/rates; superseded by the narrowed `manager/earnings` endpoint.
5. Legacy earning-path constants (`ELIGIBLE_TRANSACTION_TYPES` in
   `manager-constants.ts`) coexisting with the new `activityType` rules — unify in
   Increment 08.

---

## 8. Standing preservation commitments

1. No prototype behavior is changed by Increment 00 (either revision) — this file and
   ADR 0001 are documentation only.
2. All pre-existing gate results are recorded in §2 at the current HEAD; future
   regressions are attributable to increments that run after this record.
3. Existing tracked files (`worklog.md`, `MANAGER_MODULE_AGENT_IMPLEMENTATION_PLAN.md`,
   `db/custom.db`, screenshots, `.zscripts/`, tooling-managed `AGENTS.md` block and
   `CLAUDE.md`) are preserved untouched.
4. The generic resources layer and every `replace`-classified route remain running
   until their mapped increment retires them; no route is deleted early. The two
   manager organization stubs stay in place until Increment 08 deletes them as part
   of the referral-attribution slice.
