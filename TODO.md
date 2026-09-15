# Manager Module — Implementation Phases

Source plan: `MANAGER_MODULE_AGENT_IMPLEMENTATION_PLAN.md`. Conventional commits,
author `Daniel130me <kosokodaniel@gmail.com>`, one commit per phase.

- [x] **Phase 0 — Environment**: `db:seed` script, `.env` sanity (`file:../db/custom.db`
      relative to `prisma/`), README notes. `chore(manager): add db:seed script…`
- [x] **Phase 1 — Types**: `manager` UserRole, attribution fields on
      Pharmacy/Laboratory, `entityType: "manager"`, full manager type block.
      `feat(manager): add manager domain types and role`
- [x] **Phase 2 — Schema**: 10 Prisma models + indexes, attribution fields,
      fixed pre-existing PayoutRequest multi-FK defect. `feat(manager): add manager module prisma models…`
- [x] **Phase 3 — Seed**: idempotent FK-safe reset + full manager story
      (portfolio, rules, payments, ledger incl. reversal, payouts, applications,
      tickets, bank details, notifications, audit). `feat(manager): seed manager demo story…`
- [x] **Phase 4 — Policy modules + tests**: manager-constants, earnings policy
      (idempotent earnings, clamped reversals, balance, FIFO allocation),
      assignment policy, access/DTO allowlists; vitest with throwaway SQLite;
      24 unit/integration tests. `feat(manager): add earnings, assignment and access policy modules…`
- [x] **Phase 5 — Query endpoints + service**: /api/manager/{dashboard,
      organizations,organizations/[id],applications,earnings,payouts,support,
      support/[id],me} + managerService + sessionApi. `feat(manager): add manager query endpoints…`
- [x] **Phase 6 — Action endpoints**: manager-onboard-organization,
      admin-review-manager-application, admin-assign-manager, admin-manager-rule,
      confirm-organization-payment (idempotent), refund-organization-payment,
      manager-request-payout (balance-checked), manager-update-ticket.
      `feat(manager): add manager action endpoints…`
- [x] **Phase 7-9 — Manager Portal**: shell + 18 views (dashboard, portfolios,
      detail tabs, onboard, applications, earnings, transactions, payouts,
      support, ticket actions, reports, notifications, resources, profile,
      bank details, settings). `feat(manager): add manager portal shell…` / `feat(manager): complete manager portal pages…`
- [x] **Phase 10 — Admin section**: managers directory + detail, applications
      review, earnings/rules oversight, escalation console, admin query
      endpoints, payout settlement hook. `feat(manager): complete manager portal pages and admin manager section`
- [x] **Phase 11 — Verification**: lint clean, tsc baseline unchanged (35
      pre-existing), 24 tests green, browser walkthrough of the full
      presentation path, README + this TODO.
