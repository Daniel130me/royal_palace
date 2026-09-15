# Royal Palace Manager Management Module

## Agent-builder implementation brief

Use this document as the authoritative implementation instruction for adding the Manager Management Module to the current Royal Palace Health Care prototype.

The implementation must extend the existing application. Do not rebuild the project, replace its routing approach, introduce another frontend framework, or create a disconnected demo. Preserve the existing Next.js 16, TypeScript, Tailwind/shadcn, Zustand hash-router, typed service layer, Next.js API routes, Prisma, and SQLite prototype architecture.

## 1. Objective

Add `manager` as a first-class platform role alongside patient, doctor/dentist, pharmacy, laboratory, logistics, and administrator.

A Manager is an authorized Royal Palace user who:

- acquires and onboards pharmacies and laboratories;
- manages an assigned portfolio of pharmacies and laboratories;
- monitors non-clinical account, verification, payment, and operational status;
- provides first-level support and escalates unresolved cases to Royal Palace;
- earns a configured percentage of eligible payments made by managed organizations to Royal Palace; and
- requests and tracks payouts of available Manager Earnings.

Never call this feature an affiliate, referral, channel-partner, or partner system in user-facing copy. Use these terms consistently:

| Use | Do not use |
|---|---|
| Manager | Affiliate / Partner |
| Manager Portal | Affiliate / Partner Portal |
| Manager ID | Partner ID |
| Manager Earnings | Affiliate Commission |
| Revenue Share | Referral Commission |
| Manager Onboarding Link | Referral Link |
| Manager Code | Referral Code |
| Acquired by | Referred by |
| Currently managed by | Partner owner |
| Manager Assignment | Partner Assignment |

The module must distinguish permanently between:

1. **Acquired by** — the Manager responsible for bringing an organization onto the platform. This attribution does not change when a portfolio is reassigned.
2. **Currently managed by** — the Manager presently responsible for the organization. This can change, but every change must create assignment history.

## 2. Scope and locked business decisions

Implement the complete, clickable, database-backed prototype flow. Authentication, external payments, bank disbursement, SMS/email, document storage, and identity verification remain simulated, consistent with the rest of the prototype.

For this prototype, an **eligible payment** is a successful payment made by a pharmacy or laboratory to Royal Palace for a subscription, renewal, platform fee, or explicitly configured service fee.

Do not calculate Manager Earnings on:

- patient medicine purchases;
- patient laboratory bills;
- provider consultation payments;
- logistics fees;
- taxes, penalties, failed payments, cancelled payments, or refunded amounts; or
- an organization merely registering or being assigned.

The existing `Payment` model is patient-centric and must not be repurposed. Add a dedicated `OrganizationPayment` model. Design the revenue-share rule so additional payment types can be enabled later without changing the calculation engine.

Do not split funds at the payment gateway. Record the organization payment first, then create an internal Manager Earnings ledger entry. This is necessary for idempotency, refunds, reversals, reconciliation, rule changes, and payout controls.

## 3. Required user experience

### 3.1 Manager Portal

Create `src/features/manager/manager-portal.tsx` and pages under `src/features/manager/pages/`. Add the portal to `AppRoot`, the hash router, role types, login handling, and the demo persona switcher.

Use these views and hash routes:

| Navigation item | Route | Purpose |
|---|---|---|
| Dashboard | `#/manager/dashboard` | Portfolio, earnings, application, and support summary |
| My Pharmacies | `#/manager/pharmacies` | Searchable, filterable pharmacy portfolio |
| Pharmacy detail | `#/manager/pharmacy?id=...` | Allowed business, account, payment, earnings, and support data |
| My Laboratories | `#/manager/laboratories` | Searchable, filterable laboratory portfolio |
| Laboratory detail | `#/manager/laboratory?id=...` | Allowed business, account, payment, earnings, and support data |
| Onboard Organization | `#/manager/onboard` | Invite/register a pharmacy or laboratory |
| Organization Applications | `#/manager/applications` | Track draft, submitted, under-review, approved, rejected, and information-required applications |
| Manager Earnings | `#/manager/earnings` | Earnings totals and status breakdown |
| Transactions | `#/manager/transactions` | Exact payment-to-earning ledger explanation |
| Payouts | `#/manager/payouts` | Available balance and payout requests |
| Support | `#/manager/support` | Portfolio tickets, first-level resolution, and escalation |
| Ticket detail | `#/manager/ticket?id=...` | Messages, activity timeline, resolution, and escalation |
| Reports | `#/manager/reports` | Portfolio, activation, revenue, earnings, and support trends |
| Notifications | `#/manager/notifications` | Manager-specific activity alerts |
| Resources | `#/manager/resources` | Responsibilities, support guide, and downloadable agreement placeholders |
| Profile | `#/manager/profile` | Personal, employment, territory, and verification details |
| Bank Details | `#/manager/bank-details` | Masked payout account details and edit form |
| Settings | `#/manager/settings` | Notification and account preferences |

The desktop sidebar can group secondary items if the existing `AppShell` supports it. Mobile navigation must remain usable and must not overflow. Reuse the existing healthcare components (`AppShell`, `PageHeader`, `SectionCard`, `MetricCard`/`StatTile`, `StatusBadge`, empty/loading/error states, dialogs, segmented controls) and the established visual language.

### 3.2 Dashboard content

Show database-derived values, not hard-coded card numbers:

- total managed organizations, pharmacies, and laboratories;
- active, pending verification, inactive, and suspended organizations;
- organizations acquired by the Manager;
- successful eligible payment value this month;
- Manager Earnings this month, pending, available, paid, and reversed;
- open tickets, tickets awaiting Manager response, and escalated tickets;
- pending organization applications;
- recent portfolio activity and notifications; and
- small monthly revenue/earnings chart using the existing chart library.

Every card that represents a list must navigate to the corresponding filtered page.

### 3.3 Organization lists and details

List rows/cards must include organization name, organization number, type, city/state, verification status, relationship status, date assigned, last eligible payment, earnings generated, and open-ticket count.

Organization detail may show only:

- business identity and contact persons;
- address, branches, territory, and date joined;
- verification, subscription/payment, and account status;
- acquisition attribution and current assignment;
- eligible organization-to-Royal-Palace payments;
- Manager Earnings caused by those payments;
- open actions, support tickets, and support history; and
- non-clinical activity/audit summaries.

It must never return or render patient names, contact data, delivery addresses, diagnoses, consultations, health records, prescriptions, uploaded prescriptions, medicines ordered, laboratory requests/results, samples, clinical notes, private messages, or clinical attachments.

Enforce this with dedicated server-side DTOs using explicit `select` allowlists. Hiding fields in React is not sufficient.

### 3.4 Onboarding and applications

Display a unique Manager Code and Manager Onboarding Link. The prototype may copy the link locally rather than send an external invitation.

The onboarding form must support pharmacy and laboratory and collect business name, organization type, contact person, email, phone, address, city, state, registration/licence identifiers, and optional notes. Validate required fields with Zod or the project’s existing form-validation pattern.

Submission creates a `ManagerOrganizationApplication` tied to both the acquiring Manager and Manager Code. Approval must preserve `acquiredByManagerId`, assign the organization to the Manager unless the administrator selects another Manager, create the initial active assignment-history record, and write audit/notification records in one database transaction.

An administrator must also be able to assign an organization that registered independently. In that case `acquiredByManagerId` may remain null while `currentManagerId` is populated.

### 3.5 Manager Earnings and transactions

Use **Manager Earnings** in headings and summaries. “Revenue Share” may be used for the configured percentage. The transaction table must explain every earning with:

- earning number;
- organization;
- organization type;
- organization-payment number/reference;
- payment type;
- eligible gross amount;
- snapshotted rate;
- earning or reversal amount;
- status;
- occurrence date; and
- payout reference when paid.

Use integer basis points for rates (`1000` = `10.00%`) and integer money values, matching the prototype's current whole-naira convention. Never store a new Manager rate as a floating-point percentage. Calculate with a single tested helper and round once.

The earning lifecycle is `pending -> available -> paid`, with separate negative reversal ledger entries for full or partial refunds. Never delete an earning or silently rewrite its original amount/rate. Snapshot the active rule and assignment on the earning entry so historical results do not change after reassignment or rule changes.

### 3.6 Payouts

Extend `PayoutRequest` to allow `entityType: "manager"` and an optional Manager relation. Do not force Manager Earnings through the existing `Settlement` gross/commission/net semantics because a Manager earning is itself the payable amount.

Manager available balance is:

`sum(available earnings and reversals not already allocated to a non-rejected payout)`.

The server must validate the requested amount against the available balance inside a database transaction. A Manager must not be able to submit zero, negative, duplicate, or over-balance payout requests. Display statuses `requested`, `processing`, `paid`, and `rejected`; mask bank account numbers; notify Admin when requested and Manager when processed.

### 3.7 Support flow

Implement this flow:

`Pharmacy/Laboratory -> assigned Manager (Level 1) -> Royal Palace (Level 2) -> Finance/Technical/Operations/Compliance`.

Ticket statuses are:

- `new`
- `assigned_to_manager`
- `manager_investigating`
- `waiting_for_organization`
- `escalated_to_royal_palace`
- `royal_palace_investigating`
- `resolved`
- `closed`
- `reopened`

Managers can view and act only on tickets belonging to their currently assigned organizations. They can reply, add a Manager-only working note, request organization information, resolve, or escalate with a required reason. Admin can see all tickets, add admin-internal notes, route an escalation to a department, and resolve/return it. Shared messages are visible to the organization and Manager; internal notes must be filtered by role and visibility.

### 3.8 Admin Portal changes

Add a Manager section to the Admin Portal with:

- all/pending/active/suspended Managers;
- Manager profile and verification review;
- portfolio and acquisition attribution;
- assign/reassign organization with mandatory reason;
- assignment history;
- organization applications;
- revenue-share rules;
- Manager Earnings ledger and reversals;
- Manager payout review;
- support escalations;
- performance report; and
- filtered Manager audit log.

At minimum, expose `#/admin/managers`, `#/admin/manager?id=...`, `#/admin/manager-applications`, `#/admin/manager-assignments`, `#/admin/manager-earnings`, and `#/admin/manager-support`. Existing admin payout/settlement screens may include Manager rows when the meaning is clear.

Every admin mutation must require a reason where appropriate and create an `AuditLog` plus relevant notifications.

## 4. Data model

Add these Prisma models. Follow the current SQLite-compatible string-status convention, validate statuses in application code, and add the listed indexes.

### `Manager`

Fields: `id`, `userId` (unique), `managerNumber` (unique), `onboardingCode` (unique), first/last name, email, phone, city, state, territory, employment status, verification status, joined date, optional profile image, timestamps, and relations.

### Organization attribution

Add nullable acquisition/current-management fields to both `Pharmacy` and `Laboratory`:

- `acquiredByManagerId`
- `acquiredAt`
- `currentManagerId`
- `managerAssignedAt`
- `managerRelationshipStatus`

Add named Prisma relations to `Manager` and indexes on `acquiredByManagerId`, `currentManagerId`, and `(currentManagerId, managerRelationshipStatus)`.

### `ManagerAssignment`

Fields: `id`, `managerId`, `organizationType`, nullable `pharmacyId`, nullable `laboratoryId`, `source`, `relationshipStatus`, `startsAt`, nullable `endsAt`, `assignedBy`, nullable `reason`, and timestamps.

Exactly one of `pharmacyId` or `laboratoryId` must be present. Enforce that invariant in a single assignment action. Reassignment must close the prior active assignment, update the organization's current-manager cache fields, create the new assignment, and audit/notify inside one Prisma transaction. Do not expose a generic update route for assignment mutations.

Indexes: `(managerId, relationshipStatus)`, `(pharmacyId, startsAt)`, `(laboratoryId, startsAt)`, and `(organizationType, relationshipStatus)`.

### `ManagerOrganizationApplication`

Fields: `id`, unique application number, `managerId`, organization type, submitted business/contact/licence fields, status, submitted/reviewed timestamps, reviewer, reviewer note, optional created pharmacy/laboratory ID, and timestamps.

Indexes: `(managerId, status)`, `(status, submittedAt)`, and organization type.

### `OrganizationPayment`

Fields: `id`, unique payment number, organization type, nullable pharmacy/laboratory relation, transaction type, amount, currency, method, status, gateway/reference string, paid/refunded timestamps, refund amount, and timestamps.

Exactly one organization relation must be present. A unique external reference/event key must make payment confirmation idempotent.

Indexes: organization/date, `(status, paidAt)`, transaction type, and external reference.

### `ManagerRevenueShareRule`

Fields: `id`, `managerId`, organization type, transaction type, `rateBps`, effective-from/effective-until, status, created/approved by, and timestamps.

Rules may differ by Manager, organization type, and payment type. Reject overlaps for the same scope and time range. Never hard-code `10%` in business logic.

Indexes: `(managerId, organizationType, transactionType, status)` and the effective-date fields.

### `ManagerEarning`

Fields: `id`, unique earning number, unique `eventKey`, `managerId`, `managerAssignmentId`, `organizationPaymentId`, organization type/id/name snapshot, payment type, signed eligible amount, snapshotted `rateBps`, signed earning amount, entry type (`earning` or `reversal`), status, available date, nullable reversal-of relation, nullable payout request ID, and timestamps.

Indexes: `(managerId, status, createdAt)`, organization/date, payment ID, payout request ID, and reversal relation.

### `ManagerBankAccount`

Fields: `id`, unique `managerId`, bank name/code, account name, encrypted-or-prototype account number, verification status, verified timestamp, and timestamps. API responses must return only a masked account number except in the explicit edit workflow. Add a comment that production must use encryption/tokenization and a payout-provider recipient code.

### `SupportTicket` and `SupportTicketMessage`

Tickets contain ticket number, organization type/id/name snapshot, assigned Manager, subject/category/priority/status, escalation department/reason/time, resolution/time, creator, and timestamps. Messages contain ticket, actor ID/role, message body, optional attachment metadata, visibility (`shared`, `manager_internal`, `admin_internal`), and timestamp.

Indexes: Manager/status/date, organization/status, escalation/status, and ticket-message date.

### Optional agreement record

Add `ManagerAgreement` if the Resources/Profile UI displays acceptance state. Store agreement type, version, status, accepted/signed date, and document metadata. Do not store binary documents in SQLite.

## 5. Backend and domain logic

Create dedicated, role-scoped Manager endpoints/actions rather than using the generic resource route for sensitive aggregates or mutations. Suggested structure:

- `src/app/api/manager/dashboard/route.ts`
- `src/app/api/manager/organizations/route.ts`
- `src/app/api/manager/organizations/[id]/route.ts`
- `src/app/api/manager/applications/route.ts`
- `src/app/api/manager/earnings/route.ts`
- `src/app/api/manager/payouts/route.ts`
- `src/app/api/manager/support/route.ts`
- `src/app/api/actions/manager-onboard-organization/route.ts`
- `src/app/api/actions/admin-review-manager-application/route.ts`
- `src/app/api/actions/admin-assign-manager/route.ts`
- `src/app/api/actions/admin-manager-rule/route.ts`
- `src/app/api/actions/confirm-organization-payment/route.ts`
- `src/app/api/actions/refund-organization-payment/route.ts`
- `src/app/api/actions/manager-request-payout/route.ts`
- `src/app/api/actions/manager-update-ticket/route.ts`

Create small server-side domain modules, for example:

- `src/lib/manager-access.ts` — assignment checks and DTO allowlists;
- `src/lib/manager-earnings-policy.ts` — rule lookup, basis-point calculation, idempotent earning/reversal creation; and
- `src/lib/manager-assignment-policy.ts` — acquisition, assignment, and reassignment invariants.

Non-obvious financial and reassignment logic must be commented. Keep UI components free of business calculations.

### Earning creation algorithm

When an organization payment becomes successful:

1. Return the existing result when its unique event/reference has already been processed.
2. Resolve the organization and the assignment active at the payment timestamp.
3. Resolve exactly one active revenue-share rule for Manager + organization type + transaction type + timestamp.
4. If no eligible rule exists, record the successful organization payment but do not invent an earning.
5. Calculate once using `round(eligibleAmount * rateBps / 10000)`.
6. Create an immutable Manager Earning with assignment and rule snapshots.
7. Audit and notify the Manager.
8. Complete payment, earning, audit, and notification writes in one Prisma transaction.

Refunds create signed negative reversal entries linked to the original earning. Multiple partial refunds must be supported through unique refund event keys; cumulative reversals must never exceed the original earning.

## 6. Client types and services

Extend `src/types/index.ts` with `manager` in `UserRole` and explicit interfaces/unions for all new records and statuses. Do not use `any`.

Extend `src/lib/services.ts` with a `managerService` and focused admin Manager methods. UI pages must use the service layer and must never import Prisma or call raw endpoints directly.

Add serialization only where SQLite JSON-string fields require it. Prefer relational scalar fields over JSON for searchable/filterable Manager data.

## 7. Demo data and presentation story

Add a deterministic demo account:

- Role: `manager`
- Email: `manager@demo.com`
- Password: `demo123`
- Name: `Oluwagbenga Kosoko`
- Manager ID: `MGR-00128`
- Manager Code: `MGR00128`

Add the Manager to the persona switcher and README credentials. Use seed-only readable IDs; never make application logic depend on them.

Seed enough synthetic data to make every page meaningful:

- Grace Community Pharmacy and MedLab Diagnostics in the current portfolio;
- acquisition/current-manager attribution and active assignment history;
- at least one historical reassignment example;
- one active pharmacy and one active laboratory revenue-share rule with different rates;
- successful, pending, refunded, and reversed organization-payment/earning examples;
- pending, available, paid, and reversed earnings;
- at least one requested and one paid Manager payout;
- applications across several statuses;
- support tickets in Manager-level, escalated, and resolved states;
- Manager notifications, bank details, and agreement acceptance; and
- monthly data for dashboard/report charts.

The presentation path must work without manual database edits:

1. Switch to Manager.
2. Review portfolio and earnings summary.
3. Open Grace Community Pharmacy and inspect non-clinical status/payment/support information.
4. Submit or inspect an organization application.
5. Trace an organization payment into a Manager Earning.
6. Open a first-level support ticket and escalate it.
7. Request an allowed payout.
8. Switch to Admin, inspect the Manager, assignment history, earnings, payout, and escalated ticket.

## 8. Performance and maintainability requirements

- Use Prisma `select` to fetch only fields needed by each response.
- Calculate dashboard totals in the database with `count`, `aggregate`, and `groupBy`; do not load full tables and reduce in React.
- Use parallel independent reads with `Promise.all` or Prisma `$transaction` where a consistent snapshot is required.
- Paginate organization, application, earning, payment, ticket, notification, and audit lists. Default to 20 and cap at 100.
- Prevent N+1 queries by fetching summaries in grouped queries and mapping by organization ID.
- Add all indexes specified above and verify query filters align with them.
- Centralize statuses, labels, route names, and rate conversion helpers. Avoid magic strings and numbers.
- Keep files focused and components small. Extract repeated organization cards, financial summaries, filters, and support timeline elements.
- Comment only non-obvious policy/invariant logic.
- Preserve existing staged and unstaged work. Do not reset the repository, overwrite `db/custom.db`, or use destructive Prisma reset/push commands.

## 9. Security and privacy requirements

This is a healthcare application. Manager access is business-relationship access, never clinical access.

- Verify role and portfolio scope server-side for every Manager request.
- Do not trust a `managerId` received from the browser without matching it to the authenticated/simulated session identity.
- Do not return clinical models and then filter in the client.
- Use response DTO allowlists and negative tests for forbidden fields.
- Never place bank account numbers, passwords, clinical data, or private ticket notes in logs or notifications.
- Write audit events for login, application submission/review, assignment/reassignment, rule changes, payment confirmation/refund, earning/reversal, payout lifecycle, ticket escalation/resolution, verification, suspension, and bank-detail changes.
- Make the prototype limitation explicit: current authentication is simulated. Production must replace it with server-managed sessions, hashed credentials, CSRF protection, authorization middleware, encrypted secrets/bank data, and PostgreSQL.

## 10. Testing and verification

Add automated tests for:

### Unit tests

- basis-point calculation and rounding;
- active rule resolution by date/type;
- no rule/no assignment behavior;
- assignment interval resolution;
- full and partial reversal limits;
- available payout balance calculation; and
- Manager DTO redaction.

### API/integration tests

- duplicate payment confirmation creates one earning;
- payment before/after reassignment credits the historically correct Manager;
- successful eligible organization payment creates the expected earning;
- patient purchase/lab booking does not create Manager Earnings;
- refund creates the correct negative reversal;
- overlapping rules are rejected;
- reassignment closes the old assignment and preserves acquisition attribution;
- a Manager cannot view another Manager's organization/ticket/earnings;
- organization detail responses contain no forbidden clinical/patient keys;
- payout cannot exceed available balance or double-allocate earnings; and
- every admin mutation produces audit and notification records.

### UI acceptance checks

- all routes render on desktop and mobile widths;
- loading, empty, error, populated, and filtered states are present;
- persona switcher and direct hash links enter the Manager Portal;
- every dashboard link opens the correct filtered destination;
- amounts, dates, statuses, and masked bank details are formatted consistently;
- the complete presentation path in section 7 works from seeded data.

Run and report:

```bash
npm run lint
npx tsc --noEmit
npm test -- --run
npx next build
```

If a command exposes a pre-existing failure, distinguish it from failures introduced by this feature. Do not claim success when checks fail.

## 11. Implementation order

Implement in this sequence so each step has a testable boundary:

1. Add domain/status types and Prisma models/indexes.
2. Generate a non-destructive migration and update seed data.
3. Add Manager role routing, login handling, `AppRoot`, and persona switcher entry.
4. Add access, assignment, and earnings policy modules with unit tests.
5. Add dedicated Manager query endpoints and typed service methods.
6. Implement Manager Portal shell, dashboard, portfolio lists, and organization detail DTOs.
7. Implement onboarding/application flow and Admin review.
8. Implement organization payments, configurable rules, earnings ledger, refunds/reversals, and Admin financial views.
9. Implement Manager payout validation and UI.
10. Implement support routing, ticket timeline, and Admin escalation flow.
11. Implement reports, notifications, resources, profile, bank details, agreements, and settings.
12. Complete responsive polish, accessibility, negative privacy tests, end-to-end presentation walkthrough, and documentation.

## 12. Definition of done

The feature is complete only when all of the following are true:

- `manager` is a functional first-class role with its own portal and seeded login.
- The UI contains no affiliate/partner/referral terminology for this module.
- Acquired-by and currently-managed-by are distinct and reassignment history is preserved.
- Manager pages show only assigned portfolio data and no patient/clinical data.
- Eligible organization payments create exactly one correctly calculated Manager Earning.
- Refunds create traceable reversals and do not mutate/delete historical earnings.
- Rates are configurable, effective-dated, snapshotted, and stored in basis points.
- Manager payouts are balance-checked and visible to Admin.
- Support tickets route Manager first and allow controlled Admin escalation.
- Admin can review Managers, applications, assignments, rules, earnings, payouts, and escalations.
- Seed data supports the full presentation story.
- Queries are selected, indexed, paginated, and free from obvious N+1 behavior.
- Types are explicit, logic is maintainable, non-obvious invariants are commented, and no hard-coded production assumptions were introduced.
- Lint, type checking, tests, and build have been run, with honest results documented.

## 13. Required implementation walkthrough

At handoff, provide:

1. files and database models changed;
2. migration and seed behavior;
3. the exact presentation path and credentials;
4. commission/payment/reversal/payout behavior;
5. privacy and authorization enforcement;
6. test/build results and any remaining limitations; and
7. an explicit maintainability review confirming that the work is readable, well-structured, commented where logic is non-obvious, easy to extend, query-efficient, and free of unnecessary hard-coded assumptions.

Do not stop after producing static screens. The Manager Portal, Admin controls, assignments, payments, earnings, payouts, tickets, notifications, and seeded demo story must persist through the existing service/API/Prisma layers.
