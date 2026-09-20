# Current-State Baseline — Increment 00 Record

**Status:** Increment 00 deliverable (protect the current baseline)

**Controlling specification:** `docs/PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md`

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
| `remove` | Prototype mechanics that must not exist in production (generic CRUD, demo auth). |

---

## 1. Environment snapshot (recorded 2026-09-20)

### Git state at capture

| Item | Value |
| --- | --- |
| Repository root | `/home/z/my-project/royal_palace` (clone of `https://github.com/Daniel130me/royal_palace.git`) |
| Active branch | `feat_prod` (tracks `origin/feat_prod`) |
| HEAD at capture | `cf7331a` `docs: add production backend implementation plan` (identical to `origin/main`) |
| Worktree state | Clean before this document; only gitignored artifacts added by verification (`node_modules/`, `.next/`) |
| Tracked files | 358 |

### Runtime versions

| Tool | Version |
| --- | --- |
| git | 2.47.3 |
| Node.js | v24.21.0 |
| bun (package manager of record — `bun.lock`) | 1.3.14 |
| TypeScript | ^5 (5.x via lockfile) |
| Next.js | ^16.1.1 (React ^19) |
| Prisma | ^6.11.1 |
| ESLint | ^9 (`eslint-config-next` ^16.1.1) |
| Vitest | ^5.0.1 |

### Package manager and install discipline

- Lockfile of record: `bun.lock`. Install with `bun install --frozen-lockfile`.
- No `pnpm-workspace.yaml` / Turborepo yet (monorepo split is Increment 01 work).

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
  `DATABASE_URL=file:../db/custom.db` — a committed SQLite file with seeded demo data
  (including plaintext demo passwords). `.gitignore` lists `.env*`, but `.env` was
  committed before ignoring took effect, so it remains tracked.
- `db/custom.db` is committed to the repository. It is demo/synthetic data and must never
  be promoted to production (plan §27.11).
- `.zscripts/*.sh` assume Linux + bun + Caddy and package the SQLite DB into deploy
  artifacts; they are deployment plumbing for the prototype hosting environment, not a
  production deployment path.

---

## 2. Baseline quality-gate results

All gates were run on the clean worktree at `cf7331a` before any Increment 00 edits.

| Gate | Command | Result |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | PASS (859 packages) |
| Type check | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `bun run lint` | PASS (exit 0, no findings) |
| Tests | `bun run test` | PASS — 24/24 tests in 2 files (`tests/unit/manager-constants.test.ts`: 14, `tests/integration/manager-earnings-policy.test.ts`: 10, DB-backed) |
| Production build | `bun run build` | PASS (exit 0) |

**Known pre-existing failures: none.** All four verification gates are green at baseline.

**Pre-existing quality risks (recorded now; remediated by later increments, NOT this one):**

1. `next.config.ts` sets `typescript.ignoreBuildErrors: true` — type errors do not block
   `next build` even though the CLI `tsc --noEmit` is clean today. (Increment 01 removes it.)
2. `tsconfig.json` sets `strict: true` but weakens it with `noImplicitAny: false`;
   `tests/` and `examples/` are excluded from the project.
3. `eslint.config.mjs` disables ~27 rules, including `@typescript-eslint/no-explicit-any`,
   `no-unused-vars`, `react-hooks/exhaustive-deps`, `no-console`, `no-debugger`.
4. No Prisma migrations directory exists; schema sync relies on
   `prisma db push --accept-data-loss` (forbidden in production by plan §6).
5. No `middleware.ts`; authentication is opt-in per route (see §3).
6. Test coverage is limited to manager-module constants and earnings policy; no auth,
   session, appointment, payment, or upload tests.
7. `package.json` scripts are OS-specific (`cp -r`, `tee`, inline `NODE_ENV=`).
8. `next-auth` is installed but unused (no NextAuth code in `src/`).

---

## 3. API route inventory and classification (45 route handlers)

Grouped by route family. “Auth mechanism” names the helper or notes absence. All 45
routes are affected by the same root defect: **identity is client-asserted** — either
via the unsigned `x-rp-session` header (a client-controlled JSON blob
`{userId, role, profileId}`) or via actor/patient/organization fields in the request
body. The session helpers verify only that the referenced user row exists and is active;
they cannot detect a forged header because the header itself is the bearer credential.

### 3.1 Auth (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | Validate credentials, return session JSON for localStorage | Credential check vs `User` table | N (credentials checked) — but issues unsigned client-held session | **Plaintext password comparison** (`user.password !== password`); unsigned session blob, no expiry/signature | replace | Identity & Access (Incr. 04) |
| `/api/actions/signup` | POST | Public patient self-signup; returns session | None (public by design) | Y — all identity fields from body | **Plaintext password stored**; fake DOB/city defaults; returns full patient row | replace | Identity & Access (Incr. 04) |

### 3.2 Generic resource layer (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/resources/[collection]` | GET, POST | Generic list/create over ~33 Prisma models with arbitrary filters | **None** | Y — everything client-controlled | **Unauthenticated read/create of all data** (incl. `user` rows → plaintext passwords, payments, audit logs, consents); arbitrary `where` from query params | remove | Cross-cutting — forbidden by plan §23; superseded by per-domain endpoints |
| `/api/resources/[collection]/[id]` | GET, PATCH, DELETE | Generic fetch/update/delete any row by id | **None** | Y — everything client-controlled | **Unauthenticated update/delete of any row**; business logic (manager payout settlement) embedded in generic PATCH | remove | Cross-cutting — superseded by per-domain endpoints |

### 3.3 `actions/*` — patient, clinical, pharmacy, laboratory, logistics (19 routes, ungated)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/book-appointment` | POST | Create appointment + payment | None | Y — `patientId`, `providerId`, `method` from body | **Simulated payment success** (`status:"successful"`, `DEMO-PAY…` ref, appointment pre-marked `paid`) | replace | Scheduling & Consultation (Incr. 09) |
| `/api/actions/progress-appointment` | POST | Appointment status transitions | None | Y — `actorId`/`actorRole` from body into audit log | Unauthenticated write; audit actor client-asserted | replace | Scheduling & Consultation (Incr. 09) |
| `/api/actions/start-encounter` | POST | Open clinical encounter | None | Y — `actorId` from body | Unauthenticated clinical write | replace | Clinical Encounters (Incr. 11) |
| `/api/actions/complete-encounter` | PATCH | Lock/sign encounter, complete appointment | None | Y — `actorId` from body | Unauthenticated clinical write; signing has no verified signer identity | replace | Clinical Encounters (Incr. 11) |
| `/api/actions/issue-prescription` | POST | Create prescription + items | None | Y — `patientId`, `providerId`, `actorId` from body | Unauthenticated clinical write (anyone can issue Rx as any provider) | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/upload-prescription` | POST | Patient uploads paper Rx image | None | Y — `patientId` from body | **Base64 file stored in DB** (`UploadedPrescription.dataUrl`); no size/type validation | replace | Prescriptions & Pharmacy + Files (Incr. 10/11) |
| `/api/actions/create-referral` | POST | Provider-to-provider referral + access grant | None | Y — both provider ids from body | Unauthenticated write; creates access grant without patient consent check | replace | Consent & Access (Incr. 11) |
| `/api/actions/revoke-access` | POST | Patient revokes record-access grant | None | Y — caller not verified; `actorId` from body | Unauthenticated write | replace | Consent & Access (Incr. 11) |
| `/api/actions/create-lab-request` | POST | Provider orders lab tests | None | Y — `requestingProviderId`, `actorId` from body | Unauthenticated clinical write | replace | Laboratories (Incr. 11) |
| `/api/actions/book-lab` | POST | Patient books lab for a request | None | Y — `actorId` from body; **price from body** (`Number(price ?? 5000)`) | **Simulated payment** (`paymentStatus:"paid"`); client-set price | replace | Laboratories (Incr. 11) |
| `/api/actions/progress-lab` | POST | Lab booking status transitions | None | Y — `actorId` from body | Unauthenticated write | replace | Laboratories (Incr. 11) |
| `/api/actions/publish-lab-result` | POST | Lab publishes result | None | Y — `laboratoryId`, `actorId` from body | Unauthenticated clinical write | replace | Laboratories (Incr. 11) |
| `/api/actions/create-pharmacy-order` | POST | Patient sends Rx to pharmacy | None | Y — `patientId`, `actorId`, **item prices** from body | **Simulated payment**; unit prices trusted from client; delivery hardcoded to `LOG-001` | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/direct-pharmacy-order` | POST | OTC order without prescription | None | Y — `patientId`, `actorId` from body | **Simulated payment**; delivery hardcoded to `LOG-001` | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/progress-order` | POST | Pharmacy order status transitions | None | Y — `actorId` from body | Unauthenticated write | replace | Prescriptions & Pharmacy (Incr. 11) |
| `/api/actions/progress-delivery` | POST | Delivery status transitions | None | Y — `actorId` from body; verification code delivered to client | Unauthenticated write; verification code visible on order records | replace | Logistics (Incr. 11) |
| `/api/actions/request-payout` | POST | Provider/pharmacy/lab/logistics payout request | None | Y — `entityType`/`entityId`/`amount` from body | **Unauthenticated money-movement request for any entity, any amount**; no balance validation | replace | Settlements & Payouts (Incr. 11) |
| `/api/actions/mark-notification-read` | POST | Mark notification(s) read | None | Y — `allFor` recipientId from body | Unauthenticated; can mark any user's notifications read | replace | Notifications (Incr. 10) |

### 3.4 `actions/*` — admin & manager mutations (9 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/admin-assign-manager` | POST | Assign/reassign org to manager (tx + reason) | `getAdminContext` (`x-rp-session`) | Y — unsigned client header | Header trust model only | replace | Manager Attribution (Incr. 08) |
| `/api/actions/admin-manager-rule` | POST | Create/retire revenue-share rules | `getAdminContext` | Y — unsigned client header | Header trust model only | replace | Manager Attribution (Incr. 08) |
| `/api/actions/admin-review-manager-application` | POST | Approve/reject org application | `getAdminContext` | Y — unsigned client header | **Hardcoded demo password `demo123`** on approval-created org users | replace | Manager Attribution + Organizations & Credentialing (Incr. 07/08) |
| `/api/actions/admin-update-pricing` | POST | New ServicePrice version | **None** (`actorId` from body, default `"ADM-001"`) | Y | **Admin action with zero auth** | replace | Hospital Discovery pricing (Incr. 06) |
| `/api/actions/admin-pharmacy-commission` | POST | Set pharmacy commission % | **None** (`actorId` from body, default `"ADM-001"`) | Y | **Admin action with zero auth** | replace | Payments & Ledger commercial terms (Incr. 11) |
| `/api/actions/admin-verify-provider` | POST | Approve/reject/suspend/reactivate provider | **None** (`actorId` from body, defaults `"ADM-001"`/`"USR-ADMIN"`) | Y | **Admin action with zero auth** (self-approval possible) | replace | Organizations & Credentialing (Incr. 07) |
| `/api/actions/confirm-organization-payment` | POST | Admin records org payment + derives manager earning (tx, idempotent on reference) | `getAdminContext` | Y — unsigned client header | **Simulated payment** (admin asserts bank transfer; no PSP/reconciliation) | replace | Payments & Ledger (Incr. 09) |
| `/api/actions/refund-organization-payment` | POST | Full/partial refund + ledger reversal (tx) | `getAdminContext` | Y — unsigned client header | Admin-asserted refund (no provider event) | replace | Payments & Ledger (Incr. 09) |
| `/api/actions/manager-onboard-organization` | POST | Manager submits org application | `getManagerContext` | Y — unsigned client header | Header trust model only | replace | Manager Attribution (Incr. 08) |

### 3.5 `actions/*` — manager mutations (2 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/actions/manager-request-payout` | POST | Payout request: balance re-validation, FIFO ledger allocation, tx | `getManagerContext` + verified bank account required | Y — unsigned client header | Header trust model only (best-engineered money route in the prototype) | replace | Settlements & Payouts (Incr. 11) |
| `/api/actions/manager-update-ticket` | POST | L1 support actions (reply/note/request_info/resolve/escalate), tx + audit | `getManagerContext` + `assertTicketInPortfolio` | Y — unsigned client header | Header trust model only | replace | Support (Incr. 08) |

### 3.6 `admin/*` reads (3 routes)

| Route | Method | Purpose | Auth mechanism | Client-trusted identity | Anti-patterns | Classification | Future module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/manager-data` | GET | Admin oversight: rules, ledger totals, payouts, applications, escalations | `getAdminContext` | Y — unsigned client header | Display-only reads; header trust model | retain temporarily | Manager Attribution (Incr. 08) |
| `/api/admin/managers` | GET | Manager directory with portfolio/ticket counts | `getAdminContext` | Y — unsigned client header | Header trust model | retain temporarily | Manager Attribution (Incr. 08) |
| `/api/admin/managers/[id]` | GET | Single manager detail (portfolio, history, totals) | `getAdminContext` | Y — unsigned client header | Exposes `onboardingCode` (weak shared secret) in response | retain temporarily | Manager Attribution (Incr. 08) |

### 3.7 `manager/*` reads (9 routes)

All are portfolio-scoped reads gated by `getManagerContext` from the unsigned
`x-rp-session` header. Classification for all: **retain temporarily** (until the
Manager Attribution slice lands in Increment 08, then replace with server-derived
session endpoints). Future module for all: Manager Attribution / Support /
Settlements & Payouts as noted.

| Route | Method | Purpose | Extra scoping | Notes |
| --- | --- | --- | --- | --- |
| `/api/manager/me` | GET | Own manager profile, masked bank account, stats | — | Account number masked server-side |
| `/api/manager/dashboard` | GET | Aggregated dashboard (count/aggregate/groupBy, 6-month series) | — | Bounded aggregate queries (reusable pattern) |
| `/api/manager/earnings` | GET | Own earnings ledger with filters + status totals | — | — |
| `/api/manager/payouts` | GET | Own payout requests, available balance, masked bank details | — | — |
| `/api/manager/applications` | GET | Own org applications, paginated + status counts | — | — |
| `/api/manager/organizations` | GET | Own portfolio list with batched summaries | — | Allowlist `select` projections |
| `/api/manager/organizations/[id]` | GET | Org detail: payments, earnings, tickets, assignment history | `assertOrganizationInPortfolio` | Privacy allowlists prevent patient/clinical leakage |
| `/api/manager/support` | GET | Own portfolio support tickets, filters + counts | — | — |
| `/api/manager/support/[id]` | GET | Ticket detail | `assertTicketInPortfolio` | Filters out `admin_internal` messages server-side |

### 3.8 Tally and retirement mapping

| Classification | Count | Retirement path |
| --- | --- | --- |
| `remove` | 2 | Generic resources layer — deleted after per-domain endpoints cover every consumer (Increments 06–09 UI cutover) |
| `retain temporarily` | 12 | All manager/admin session-gated reads — replaced route-by-route during Increment 08 slices |
| `replace` | 31 | All ungated writes, both auth endpoints, all session-gated mutations — rebuilt per module through Increments 04–11 |
| **Total** | **45** | — |

---

## 4. Cross-cutting architecture findings (server side)

1. **Session helper:** `src/lib/manager-access.ts` — `getManagerContext(req)` and
   `getAdminContext(req)` parse the `x-rp-session` header, check `session.role`, then
   load the `User` row. They verify existence/active status/suspension only; the header
   itself is client-controlled and unsigned. `ManagerAccessError` carries HTTP status;
   `assertOrganizationInPortfolio` / `assertTicketInPortfolio` enforce portfolio scoping;
   `maskAccountNumber` handles bank-account masking. `PHARMACY_SELECT` /
   `LABORATORY_SELECT` are privacy projection allowlists.
2. **Session issuance/transport:** created by `/api/auth/login` and `/api/actions/signup`;
   stored client-side under localStorage key `royalPalaceSession`; attached verbatim as
   the `x-rp-session` header by `sessionHeaders()` in `src/lib/api-client.ts` (used by
   `sessionApi` and the `action()` wrappers in `src/lib/services.ts`). Plain JSON — no
   token, signature, or expiry. Logout removes the localStorage key only; no server-side
   revocation exists.
3. **No shared auth middleware:** no `middleware.ts` exists. Auth is opt-in per route;
   only the 15 manager/admin routes call the helpers. All other routes perform zero
   caller verification.
4. **Passwords:** plaintext throughout. `User.password String` (schema), direct compare
   at `src/app/api/auth/login/route.ts`, raw persistence at `/api/actions/signup`,
   hardcoded `demo123` at `admin-review-manager-application` and in `prisma/seed.ts`.
   No hashing utility exists in the codebase.
5. **Audit utility:** `src/lib/audit.ts` — `audit()` and `notify()` write
   `AuditLog`/`Notification` and swallow their own errors. Most callers pass
   client-asserted `actorId`/`actorRole` (or defaults like `"ADM-001"`), so the audit
   trail records unverified actors except on session-gated routes.
6. **Simulated payments:** every payment path auto-succeeds (`book-appointment` with
   `DEMO-PAY` prefix, `book-lab`, both pharmacy order routes, admin-recorded
   organization payments, refund assertions, and the generic PATCH that flips
   `payoutRequest.status` to `paid`). `Payment.status` defaults to `"successful"`
   in the schema. No PSP, webhook, or reconciliation path exists.
7. **Reusable domain logic (candidate to preserve through migration):** the manager
   policies — `manager-earnings-policy.ts`, `manager-assignment-policy.ts`,
   `manager-constants.ts`, `pricing-policy.ts`, `consultation-policy.ts` — and the
   state-transition guards in `src/lib/format.ts` (`canTransition*`). Their business
   rules are sound; their trust assumptions are not.
8. **Base64 clinical upload:** `UploadedPrescription.dataUrl` stores a full base64 data
   URL in SQLite and returns it verbatim in responses; rendered via `<img src={dataUrl}>`.
9. **DB client:** `src/lib/db.ts` — Prisma singleton over SQLite with `log: ['query']`
   enabled (query logging would leak sensitive values into logs if carried forward).
10. **IDs:** app-generated human strings via `genId()` (`APT-…`, `PAY-…`, `DEMO-PAY-…`)
    instead of opaque server-generated UUIDs (plan §21 requires opaque UUIDs).

---

## 5. Prototype risk inventory (client side, data layer, tooling)

### 5.1 localStorage / sessionStorage keys

| Key | File(s) | Stored | Trust / blast radius |
| --- | --- | --- | --- |
| `royalPalaceSession` | `src/lib/nav.ts` (SESSION_KEY, write/read/remove), `src/lib/api-client.ts` (literal) | Full session JSON `{userId, role, profileId, name, email}` | Sent verbatim as `x-rp-session` header; role also gates portal routing client-side only |
| `managerNotificationPrefs` | `src/features/manager/pages/settings.tsx` | Notification-channel UI preferences | Local UI only, never sent to API |
| `royalPalaceAdminSettings` | `src/features/admin/pages/settings.tsx` | Currency, support contacts, commission/margin defaults, maintenance toggle | Local UI only — NOT persisted to DB; other admin pages do not read it |

sessionStorage: zero usages. Zustand `persist`: not used.

### 5.2 Client session/identity flow

- `src/lib/api-client.ts` — `sessionHeaders()` reads `royalPalaceSession` from
  localStorage and attaches it raw as `x-rp-session`; only `sessionApi` and
  `action()` wrappers attach it. Plain `api`/`resource` helpers attach nothing and hit
  ungated routes that take identity from the body.
- `src/lib/nav.ts` — `authorizedView()` restricts portal routing by role read from
  localStorage (cosmetic enforcement only).
- Login page pre-fills demo passwords (see 5.3).

### 5.3 Plaintext/default credentials

All seed accounts use password **`demo123`** (plaintext, compared directly at login).
Source: `prisma/seed.ts`; mirrored in `README.md` and
`MANAGER_MODULE_AGENT_IMPLEMENTATION_PLAN.md`; hard-prefilled in
`src/features/auth/login-page.tsx` and `persona-switcher.tsx`.

| Role | Email | Seed IDs |
| --- | --- | --- |
| admin | `admin@demo.com` | `USR-ADMIN` / `ADM-001` |
| patient | `amina@demo.com` | `USR-PAT-001` / `PAT-001` |
| doctor | `doctor@demo.com`, `doctor2@demo.com`, `doctor3@demo.com` | `USR-DOC-001..003` / `PRO-001..003` |
| pharmacy | `pharmacy@demo.com`, `sunrise@demo.com`, `wellness@demo.com` | `USR-PHA-001..003` |
| laboratory | `lab@demo.com`, `ikejacentral@demo.com` | `USR-LAB-001..002` |
| logistics | `logistics@demo.com` | `USR-LOG-001` / `LOG-001` |
| manager | `manager@demo.com`, `manager2@demo.com` | `USR-MGR-001..002` / `MGR-001..002`, onboarding codes `MGR00128`/`MGR00129` |

Login is email+password only (no phone login). Signup stores the password raw and
activates the patient account immediately.

### 5.4 Demo/mock fallbacks

- No API-failure→demo-data fallback exists; contexts swallow errors silently
  (`.catch(() => [])` in `use-pharmacy-context.ts`, `use-provider-context.ts`,
  `use-patient-context.ts`) — a truthfulness gap to fix during slice migrations.
- Mock data produced in production components: `encounter.tsx` `addMockAttachment()`
  fabricates attachment metadata saved into clinical records; `result-new.tsx`
  “mock upload — stores file metadata only”; `manager/resources.tsx` simulated
  agreement acceptance; `patient/consultation.tsx` fully simulated video consultation.
- `direct-pharmacy-order` hardcodes `logisticsProviderId: "LOG-001"`.
- UI shell displays “Synthetic data · Simulated services” banners.

### 5.5 Simulated payment paths

| Path | Mechanism |
| --- | --- |
| `book-appointment` | Appointment pre-marked `paid`; `Payment` row auto-`successful` with `DEMO-PAY` reference |
| `book-lab` | `paymentStatus: "paid"` directly; client-supplied price defaults to 5000 |
| `create-pharmacy-order` / `direct-pharmacy-order` | `paymentStatus: "paid"` at creation |
| `confirm-organization-payment` | Admin asserts a bank transfer; creates successful `OrganizationPayment` and derives `ManagerEarning` in the same tx (idempotent on reference) |
| `refund-organization-payment` | Admin-asserted refund + clamped earning reversal |
| `resources/[collection]/[id]` PATCH | Any client can flip `payoutRequest.status` to `paid`, settling manager earnings |
| Schema | `Payment.status` defaults to `"successful"` |

### 5.6 Base64 upload/storage paths

- Client: `src/features/patient/pages/upload-prescription.tsx` — `FileReader`
  `readAsDataURL` (8 MB cap, images only) → posts `dataUrl`.
- Server: `src/app/api/actions/upload-prescription/route.ts` stores it in
  `UploadedPrescription.dataUrl` (schema comment calls it prototype-only).
- DB: `UploadedPrescription.dataUrl String` (schema line ~775).
- Rendered: `<img src={upload.dataUrl}>` in `uploads.tsx` / `upload-prescription.tsx`.
- No other `readAsDataURL`/`FileReader` usages; other attachment fields are
  metadata-only JSON strings (seed contains no `data:` URIs).

### 5.7 Prisma schema summary (42 models, SQLite)

- Datasource `sqlite`, `DATABASE_URL=file:../db/custom.db`, generator
  `prisma-client-js`, no migrations directory.
- Models: `User, Patient, Provider, ProviderApplication, Pharmacy, PharmacyProduct,
  Laboratory, LogisticsProvider, Service, ServicePrice, Appointment,
  ClinicalEncounter, Diagnosis, Prescription, PrescriptionItem, LaboratoryRequest,
  LaboratoryBooking, LaboratoryResult, PharmacyOrder, PharmacyOrderItem, Delivery,
  Referral, RecordAccessGrant, Consent, Payment, Settlement, CarePlan, Notification,
  Rating, Complaint, AuditLog, PayoutRequest, UploadedPrescription, Manager,
  ManagerAssignment, ManagerOrganizationApplication, OrganizationPayment,
  ManagerRevenueShareRule, ManagerEarning, ManagerBankAccount, SupportTicket,
  SupportTicketMessage`.
- **Roles:** single free-text `User.role String` (comment lists 7 roles but `manager`
  is used by code and missing from the comment); `User.profileId String?` is not a
  foreign key; no Admin profile table.
- **Money:** stored as `Int` whole-naira across the schema (good instinct; production
  must move to minor units + ISO 4217 per plan §21). `Float` fields are rates/metrics
  only (height/weight, ratings, `commissionPct`).
- **Blobs:** `UploadedPrescription.dataUrl` (base64 clinical image).
- **Free-text statuses:** ~31 `String` status/role/type columns (SQLite has no enums);
  validated only in application code.
- **JSON-in-String columns:** patient allergies/conditions/medications, provider
  qualifications/documents, appointment intake, encounter documentation (SOAP), lab
  tests, care plan goals, access-grant scope, referral attachments.
- **Constraint gaps (facts):** `PayoutRequest.entityId` polymorphic non-FK;
  `Notification.recipientId`, `AuditLog.actorId/entityId`,
  `SupportTicket.organizationId`, `ManagerEarning.organizationId`,
  `Payment.reference` non-FK; `Patient.userId` intentionally non-unique (dependants
  share an account); several date fields are `String` not `DateTime`
  (`dateOfBirth`, `Appointment.date/time`, `ServicePrice.effectiveFrom`,
  `Settlement.periodStart/End`); `ManagerBankAccount.accountNumber` stored in
  plaintext (masked only in responses); ManagerAssignment XOR rule enforced in app
  code only.

### 5.8 Scripts, CI, and tooling

- `.zscripts/*.sh` (Linux/bun/Caddy deploy plumbing for the prototype host):
  `build.sh` (bun install/build, self-healing next.config injection, packages
  standalone + SQLite DB into a tarball), `dev.sh` (install, `db:push`, dev server,
  mini-services; writes `dev.pid`), `start.sh` (production entry with hardcoded
  `DATABASE_URL` default and Caddy), `database-runtime-build.sh` (copies demo DB into
  artifacts, runs `db:push`), `python-runtime-build.sh` (no-op without Python files),
  three `mini-services-*.sh` (the `mini-services/` directory is empty).
  Scripts contain Chinese-language comments/logs.
- `package.json` script OS-specificity: `cp -r` in build, `tee` in dev/start, inline
  `NODE_ENV=` in start.
- Tests: 2 Vitest files, 24 cases (manager constants unit tests; DB-backed earnings
  policy integration tests with per-run temp SQLite). 3 shell-script tests for the
  deploy tooling. No auth/session/appointment/payment/upload tests.
- TS config: `strict: true` with `noImplicitAny: false`; `tests/`, `examples/`,
  `vitest.config.ts` excluded. `next.config.ts`: `ignoreBuildErrors: true`,
  `reactStrictMode: false`, `output: "standalone"`.
- ESLint: `eslint-config-next` core + TS, then ~27 rules disabled (including
  `no-explicit-any`, `no-unused-vars`, `react-hooks/exhaustive-deps`, `no-console`,
  `no-debugger`).
- No CI configuration exists in the repository (no `.github/workflows/`).

---

## 6. Migration map — prototype surface → owning future module

Plan §7 module order and §19 increment order are authoritative. This map is the
traceability matrix reviewers use to confirm every prototype route has a retirement path.

| Future module (plan §7) | Prototype surface retired | Target increment |
| --- | --- | --- |
| Identity & Access | `/api/auth/login`, `/api/actions/signup`, `royalPalaceSession` key, plaintext passwords, `x-rp-session` trust | 04 (BFF session + OIDC) |
| Policy engine & audit boundary | Ad-hoc `getManagerContext`/`getAdminContext`, client-asserted audit actors | 05 |
| Hospital Discovery | `/api/actions/admin-update-pricing`, public discovery reads via generic resources | 06 |
| Organizations & Credentialing | `/api/actions/admin-verify-provider`, org approval logic inside `admin-review-manager-application` | 07 |
| Manager Attribution | `manager/*` reads, `admin-assign-manager`, `admin-manager-rule`, `manager-onboard-organization`, onboarding codes | 08 |
| Support | `manager/support*`, `manager-update-ticket`, admin-internal note filtering | 08 |
| Scheduling & Consultation + Payments & Ledger | `book-appointment`, `progress-appointment`, simulated payments, `confirm-organization-payment`, `refund-organization-payment` | 09 |
| Files, Notifications & worker | `upload-prescription` (base64), `mark-notification-read`, silent `.catch(() => [])` fallbacks | 10 |
| Prescriptions & Pharmacy | `issue-prescription`, `create-pharmacy-order`, `direct-pharmacy-order`, `progress-order` | 11 |
| Laboratories | `create-lab-request`, `book-lab`, `progress-lab`, `publish-lab-result` | 11 |
| Logistics | `progress-delivery`, hardcoded `LOG-001` delivery | 11 |
| Clinical Encounters + Consent & Access | `start-encounter`, `complete-encounter`, `create-referral`, `revoke-access`, mock attachments in encounters | 11 |
| Settlements & Payouts | `request-payout`, `manager-request-payout`, `manager/payouts`, generic PATCH payout settlement, plaintext bank accounts | 11 |
| Cross-cutting removal | `/api/resources/[collection](/[id])` generic CRUD | After Increments 06–09 cover all consumers; deleted no later than Increment 11 |

---

## 7. Standing preservation commitments

1. No prototype behavior is changed by Increment 00 — this file is documentation only.
2. All pre-existing gate results are recorded in §2; future regressions are attributable
   to increments that run after this record.
3. Existing tracked files (`worklog.md`, `MANAGER_MODULE_AGENT_IMPLEMENTATION_PLAN.md`,
   `db/custom.db`, screenshots, `.zscripts/`) are preserved untouched.
4. The generic resources layer and every `replace`-classified route remain running until
   their mapped increment retires them; no route is deleted early.
