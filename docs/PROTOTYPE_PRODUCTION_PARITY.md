# Client-approved prototype to production parity register

## Controlling requirement

The client-approved prototype is committed product scope. The completed production
platform will be reviewed against that prototype before UAT, security qualification,
and deployment. No prototype page, workflow, report, setting, or role capability may be
removed, hidden, or materially narrowed without explicit written product-owner approval
that identifies the exact capability.

This rule preserves capabilities, not unsafe implementation details. Plaintext
credentials, browser-trusted roles, generic CRUD, simulated provider success, base64
clinical files, unbounded queries, and missing authorization must be replaced. Their
intended user outcomes must be rebuilt through production contracts, policy, audit,
PostgreSQL models, and qualified adapters.

## Reference baseline

The approved prototype is preserved across an immutable commit lineage rather than a
single current branch:

- `5ffd023` — final prototype-fix commit on the original single-app layout before the
  production implementation plan; contains the complete patient, practitioner,
  pharmacy, laboratory, logistics, manager, administrator, public, and authentication
  prototype plus its visual references.
- `6bbfa55` — approved prototype expansion for hospitals, patient enrollment,
  privacy-minimized managers, and patient-activity earnings after the monorepo move.
- `5f66f633f6c5e1fc39aaa684b9e3d2404c043bb1` — last repository state before the
  Increment 11C4 prototype-screen deletions and the immediate comparison point for that
  corrective work.
- `13915dc2e90e126c9176bbdfb4abc3b8c01c0243` — approved onboarding and governed
  clinical-catalogue expansion that added capabilities beyond the signed visual
  prototype; those additions are protected by the same no-removal rule.
- Repository audit on 2026-10-08 found only `main` and `feat_prod` locally/remotely and
  no remaining stash. Older prototype commits remain reachable in repository history.
- The root visual references remain present: patient dashboard, booking, encounter,
  records/timeline, pharmacy, laboratory, logistics, administrator, and public-home
  desktop/mobile PNGs are part of the parity review evidence.
- The machine-readable scope lock is
  [`prototype-parity.manifest.json`](./prototype-parity.manifest.json). The root
  `verify:prototype-parity` command validates its schema, immutable baseline identities,
  capability count, unique IDs, current production-file references, visual references,
  corrective checkpoints, every referenced artifact in the approved Git history, and
  this register. It runs first in `pnpm verify`; the main CI checkout retains full
  history so historical verification cannot be skipped by a shallow clone.
- Production work is not permitted to reinterpret a missing current file as product
  approval to remove its capability.
- The complete source inventory is reproducible with:

  ```text
  git ls-tree -r --name-only 5ffd023 src/features src/app/api
  git ls-tree -r --name-only 6bbfa55 src/features src/app/api
  git ls-tree -r --name-only 5f66f633f6c5e1fc39aaa684b9e3d2404c043bb1 apps/web/src/features apps/web/src/app/api
  ```

- Feature parity is judged by user outcome, role visibility, information content,
  state transitions, reports, settings, and accepted design—not merely by preserving a
  filename or visual shell.

## Status definitions

- `CONNECTED`: production API, policy, persistence, BFF, UI, and tests are connected.
- `IN PROGRESS`: production replacement is actively being implemented.
- `PENDING`: approved capability remains in scope but has not been production-migrated.
- `CORRECTIVE`: a prior increment removed or narrowed the capability and must rebuild it.
- `BLOCKED`: implementation requires a recorded material decision; the capability still
  remains committed scope.
- `ACCEPTED`: stakeholders completed prototype-parity UAT for the production equivalent.

Only `ACCEPTED` closes a parity item for release. A feature flag, disabled provider, or
pending qualification may protect production without cancelling the feature.

## Platform capability register

| Role/area                 | Client-approved prototype capabilities                                                                                                                                                                                                                                  | Production disposition                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Public                    | Home, services, practitioners and profiles, pharmacies, laboratories, pricing, help, and how-it-works                                                                                                                                                                   | `PENDING` final parity audit; discovery APIs are connected                                              |
| Authentication/onboarding | Patient signup, organization signup, practitioner signup, login, and role-aware entry                                                                                                                                                                                   | `IN PROGRESS`; production identity provider qualification remains open                                  |
| Patient                   | Dashboard, appointments and booking, consultation, consent, family, doctors, hospitals, pharmacies, pharmacy detail, laboratories, laboratory detail, prescriptions, prescription upload/history, orders, payments, records, notifications, services, and settings      | Mixed; see corrective register below                                                                    |
| Practitioner              | Dashboard, verification, availability, appointments, encounter, patients, prescriptions, laboratory requests/results, referrals, earnings, payouts, notifications, and settings                                                                                         | `IN PROGRESS`; appointment/prescription portions connected                                              |
| Pharmacy                  | Dashboard, prescriptions, orders, inventory, product catalogue/detail, delivery, commissions, settlements, payouts, notifications, and settings                                                                                                                         | `CORRECTIVE`; secure prescription/order core connected, remaining approved capabilities must be rebuilt |
| Laboratory                | Dashboard, bookings, requests/detail, result creation/results, critical results, services, settlements, payouts, notifications, and settings                                                                                                                            | `PENDING` production laboratory slice                                                                   |
| Logistics                 | Dashboard, assignments, delivery detail/progress, earnings, payout, and history                                                                                                                                                                                         | `PENDING` production logistics slice                                                                    |
| Manager                   | Dashboard, applications, referral onboarding/links, pharmacies, laboratories, earnings, transactions, reports, payouts, bank details, support/ticket follow-up, notifications, resources, profile, and settings, subject to the approved privacy-minimized manager role | `IN PROGRESS`; privacy-safe referral/earnings/support core connected, final parity audit pending        |
| Hospital                  | Hospital portal and the client-approved organization experience                                                                                                                                                                                                         | `PENDING` complete hospital operational parity; discovery/onboarding are connected                      |
| Support                   | Enrollment/application review and privacy-minimized ticket handling                                                                                                                                                                                                     | `IN PROGRESS`; production review/ticket paths connected                                                 |
| Administrator             | Dashboard, appointments, users, providers/detail, manager applications/managers/detail, manager earnings/support, orders, deliveries, payments, pharmacy commissions, settlements, pricing, clinical catalogue, complaints, audit, reports, and settings                | Mixed; production governance paths are incremental and final parity is pending                          |

The original prototype also contained `auth/persona-switcher.tsx`. Secure production
authentication correctly removed browser-selected identity and roles. Stakeholders must
still classify the persona switcher during parity review as either a prototype-only demo
aid or an approved test-environment role-preview capability. It must never return as a
production identity or authorization mechanism.

## Increment 11C4 corrective register

Increment 11C4 correctly replaced insecure prescription/order actions and generic CRUD,
but it also deleted client-approved capabilities. Commit
`90b5c5045b1566e8a45021355bc8baa94305efba` is retained because its secure production
foundation is valid. The missing capabilities must be rebuilt on that foundation rather
than restoring insecure prototype endpoints.

| Approved capability                            | Prototype reference                                    | Current status | Required production replacement                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Patient pharmacy detail                        | `patient/pages/pharmacy-detail.tsx`                    | `CORRECTIVE`   | Restore full pharmacy detail and ordering entry through public discovery plus authenticated commerce contracts                           |
| Patient prescription upload and upload history | `patient/pages/upload-prescription.tsx`, `uploads.tsx` | `CORRECTIVE`   | Purpose-bound object upload, malware scan, document verification queue, status/history, and authorized conversion to a pharmacy workflow |
| Direct/OTC pharmacy ordering                   | `actions/direct-pharmacy-order`, pharmacy-detail flow  | `CORRECTIVE`   | Governed catalogue/cart/quote/order workflow that does not bypass payment, stock, tax, or pharmacy ownership rules                       |
| Administrator order oversight                  | `admin/pages/orders.tsx`                               | `CORRECTIVE`   | Privacy-minimized search/detail, exception/dispute operations, audit, and bounded reporting                                              |
| Pharmacy inventory                             | `pharmacy/pages/inventory.tsx`                         | `CORRECTIVE`   | Internal stock ledger with products/SKUs, locations, lots/batches, expiry, adjustments, reservations, dispense linkage, and audit        |
| Pharmacy products and product detail           | `pharmacy/pages/products.tsx`, `product.tsx`           | `CORRECTIVE`   | Governed pharmacy catalogue and price/availability management backed by inventory ownership                                              |
| Pharmacy deliveries                            | `pharmacy/pages/deliveries.tsx`                        | `CORRECTIVE`   | Pharmacy handoff and logistics integration without merging clinical, commercial, and courier sources of truth                            |
| Pharmacy notifications                         | `pharmacy/pages/notifications.tsx`                     | `CORRECTIVE`   | Verified-recipient production notification inbox and preference-safe transactional events                                                |
| Pharmacy commissions                           | `pharmacy/pages/commissions.tsx`                       | `CORRECTIVE`   | Authorized pharmacy commercial reporting from immutable ledger/settlement facts                                                          |
| Pharmacy settlements                           | `pharmacy/pages/settlements.tsx`                       | `CORRECTIVE`   | Reconciled settlement lifecycle, statements, exceptions, and audit                                                                       |
| Pharmacy payouts                               | `pharmacy/pages/payouts.tsx`                           | `CORRECTIVE`   | Qualified payout workflow with separation of duties and provider reconciliation                                                          |
| Pharmacy settings                              | `pharmacy/pages/settings.tsx`                          | `CORRECTIVE`   | Organization-scoped operational, notification, fulfilment, and authorized account settings                                               |

The prescription issuance, patient routing, quote acceptance, pharmacy order,
payment-state, cancellation, dispensing, and handoff capabilities were replaced by
production contracts in 11A–11C4 and remain in scope. Their old unsafe action routes do
not need to return because the approved user outcomes must use the production services.

## Implementation order for the corrective work

The corrective work is split into reviewable production slices rather than a bulk
restoration of prototype code:

1. `11C4P-1` — lock the full approved capability/visual inventory and add automated
   verification that prevents current files or corrective tracking from disappearing
   silently. Navigation is restored with each functional production replacement rather
   than pointing users at broken or insecure prototype routes.
2. `11C4P-2` — internal pharmacy catalogue and inventory ledger, including lots,
   expiry, stock movements, reservations, bounded lists, indexes, and audit.
3. `11C4P-3` — OTC/direct ordering on the shared quote/order/payment foundation.
4. `11C4P-4` — scanned prescription upload, verification, and upload history on the
   secure file pipeline.
5. `11C4P-5` — pharmacy notifications, settings, delivery integration, and admin order
   oversight.
6. Settlement, commission, and payout parity remains part of the already planned
   settlement/payout vertical slice, with the prototype screens and outcomes as
   mandatory acceptance criteria.

No corrective slice may reintroduce generic `/resources` access, client-supplied actor
identity, simulated provider authority, unscanned file release, or unbounded lists.

## Required evidence per capability

Every row must eventually link to:

1. the production API/event contract and owning module;
2. authorization and field-visibility tests for every relevant role;
3. migration, constraint, index, and representative query evidence;
4. BFF and browser integration tests, including negative paths;
5. visual and functional comparison with the signed prototype;
6. stakeholder UAT verdict, reviewer, date, and evidence link; and
7. any qualified provider, jurisdiction, retention, or operational decision.

## Release gate

Before deployment, stakeholders must review the production platform against the signed
prototype and mark every register item `ACCEPTED`. Security or regulatory controls may
add steps or restrict activation, but an unimplemented or silently removed capability
cannot pass parity. Any agreed scope change must be written into this register with the
approver, reason, date, and replacement behavior.

## Standards walkthrough

- **Readable and maintainable:** one controlling register prevents scope decisions from
  being scattered across commits and conversations.
- **Security first:** capabilities are preserved while unsafe implementations are
  replaced; the register never authorizes restoring insecure routes.
- **Performance conscious:** every production replacement requires bounded queries,
  demonstrated indexes, and representative evidence.
- **Extendable:** capability ownership is separated from current filenames and vendors,
  allowing the implementation to evolve without losing scope.
- **No hard-coded assumptions:** Nigeria is the first launch profile, not a global domain
  default; payment, inventory, language, currency, and jurisdiction remain configurable.
- **Non-standard condition flagged:** the active frontend currently lacks the corrective
  items listed above. This is a known product regression and a release blocker until the
  secure replacements pass parity review.

## Checkpoint 11C4P-1 completion report

### Scope and architecture

Checkpoint 11C4P-1 is complete at the scope-control boundary. The machine-readable
manifest records 139 approved capabilities across administrator, authentication,
hospital, laboratory, logistics, manager, patient, pharmacy, practitioner, public, and
support portals. It binds them to the immutable prototype lineage, 16 signed visual
references, a production status, and an owning delivery checkpoint.

The verifier is a repository-level release guard rather than frontend runtime code. It
validates manifest structure, full baseline SHAs, unique portal/capability identifiers,
the locked capability count, allowed non-removal states, delivery checkpoints, visual
assets, required production files, and the presence of this controlling register. It
runs before the existing workspace gates through `pnpm verify`.

### Verification evidence

- The live repository manifest passes with 139 capabilities across 11 portals, all 16
  visual references present, and 138 distinct historical source artifacts confirmed in
  their declared immutable commits. One source page intentionally represents two
  related administrator capabilities.
- Four isolated failure-mode tests prove that the verifier accepts a complete manifest
  and rejects a missing connected screen, the forbidden `REMOVED` status, and a silent
  capability-count reduction.
- Formatting, all eight workspace lint and type-check jobs, the complete API/web/worker
  and package test suites, all eight production builds, and both Prisma schema
  validations passed after the guard was added.
- The production dependency audit found no known vulnerabilities. The existing reviewed
  development-only advisory remains time-bound for review on 2026-11-07.
- The local aggregate `pnpm verify` wrapper could not be used directly because the
  desktop host injected pnpm 11.25.0 into nested scripts while the repository requires
  11.19.0. Every constituent gate was therefore run with Corepack explicitly pinned to
  11.19.0. Remote CI remains the canonical aggregate check because it activates the
  pinned version before invoking `pnpm verify`.

### Standards review

- **Readable and maintainable:** the manifest is data, while validation behavior and
  failure-mode tests remain in small dedicated scripts. Capability status is independent
  of the current filename layout.
- **Security first:** the guard preserves approved outcomes without restoring browser-
  trusted identity, generic CRUD, unscanned files, or simulated provider authority.
- **Performance conscious:** the verifier performs bounded linear filesystem checks and
  adds no runtime query or browser cost.
- **Extendable:** new portals and capabilities are additive manifest entries with an
  explicit checkpoint; production paths can change without rewriting historical scope.
- **No magic or hard-coded regional assumptions:** immutable prototype SHAs and the
  client-approved capability count are deliberate release-control constants. Nigeria
  remains a launch profile, not reusable domain behavior.
- **Non-standard boundary:** capability parity is now mechanically guarded, but the
  corrective features are not yet implemented or stakeholder-accepted. Navigation will
  return with each functional secure replacement rather than expose dead routes.

## Checkpoint 11C4P-2A completion report

11C4P-2A restores the client-approved Products, Inventory, and product-detail surfaces
through the production API. The backend uses governed product classifications,
pharmacy-scoped SKUs and stock locations, expiry-ordered lots, materialized aggregate
balances with deferred database consistency checks, and immutable idempotent movement
evidence for receipts, returns, adjustments, and write-offs. All reads are bounded and
indexed; currency, thresholds, and near-expiry windows are record data rather than
country-specific application constants.

The legacy mutable `stockQuantity` record was not copied. That implementation could not
prove how a balance changed, represented only one batch, and used fixed currency and alert
thresholds. Capability parity is preserved while the unsafe storage model is retired.

### Remaining 11C4P-2B checkpoint

11C4P-2 is not yet complete. 11C4P-2B must connect FEFO reservation allocations and
dispensing consumption/release to the existing quote, order, and prescription lifecycle.
Synthetic inventory remains the quote adapter until that transaction boundary is complete.

### Following checkpoint

After 11C4P-2B closes the inventory transaction boundary, 11C4P-3 implements OTC/direct
ordering on the shared quote, order, and payment foundation.
