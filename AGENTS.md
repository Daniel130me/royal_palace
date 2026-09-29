# AGENTS.md — Working Standards for Implementation Agents

These are the standing engineering standards for every agent and developer working in
this repository. They complement — and never override — the controlling migration
specification at `docs/PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md`. Where the plan and
this file differ, the plan wins.

## Mandatory code qualities

All code written must be:

- Readable
- Well-structured
- Commented where logic is non-obvious (intent and constraints, not syntax — plan §6)
- Easy for another developer to pick up and extend
- Easy to understand
- Easy to maintain
- Easy to extend later
- Query-conscious: reduce unnecessary queries; paginate lists; avoid N+1
  (plan §24 query rules)
- Security-first: default-deny authorization, server-derived identity, no secrets in
  code or logs (plan §6 security rules)

## Implementation discipline

- Do not patch symptoms. Think long-term: scrutinize the architecture properly before
  implementing, and choose the design that survives the next increment.
- Treat this repository as a public, safety-sensitive healthcare product, not a
  prototype. Protect correctness, privacy, security, availability, operability, and
  maintainability even when a shortcut would be faster.
- Preserve clear dependency direction and business-capability boundaries. Domain and
  application logic must not depend on transport, framework, database, or provider
  details. Integrations belong behind explicit interfaces at the boundary that owns
  them.
- Prefer cohesive modules and explicit contracts over generic CRUD, global state, or
  convenience abstractions that weaken authorization or data ownership.
- When existing code in the path of an increment is below the required standard,
  redesign or rewrite that bounded area before building on it. Do not conceal known
  structural debt behind compatibility patches. Preserve unrelated user work.
- Always flag non-standard implementations explicitly (in code comments, commit
  messages, and the increment completion report).
- Never disable type checking, linting, tests, authorization checks, or certificate
  verification to make a build pass (plan §13.11).

## Architecture and extensibility

- Every module must have one clear owner, public contract, and reason to change.
  Cross-module access goes through an application service or published contract, not
  direct access to another module's persistence internals.
- Keep framework-specific code at the edges. Business rules must be testable without
  starting an HTTP server, browser, queue, or real cloud dependency.
- Introduce abstractions only for a present boundary or repeated behavior. Record
  material architectural choices in an ADR before implementation.
- Use backward-compatible API, event, and schema evolution. Document retirement and
  migration paths; never silently change a contract consumed by another process.
- New features must be addable by extending an owning module rather than editing
  unrelated modules or duplicating policy, validation, persistence, or telemetry.

## Global product and localization

- Treat Royal Palace as a global platform. Nigeria or any other country may be a
  launch market, test fixture, or deployment profile, but must never become an
  application-wide domain default.
- Do not hard-code a country, currency, locale, language, time zone, calling code,
  address shape, regulator, clinical taxonomy, tax rule, payment provider, cloud
  region, or data-residency rule into reusable domain or application logic.
- Represent geography and localization with governed standards and data: ISO 3166
  country codes, ISO 4217 currency codes and currency-specific minor-unit metadata,
  BCP 47 language tags, IANA time-zone identifiers, and E.164 phone numbers where a
  telephone number can be normalized internationally.
- Store timestamps as UTC instants and store the relevant IANA time zone separately
  when local civil time affects scheduling, deadlines, or reporting. Format dates,
  numbers, names, addresses, and money only at presentation boundaries using the
  requested locale.
- Jurisdiction-specific legal, privacy, retention, credentialing, tax, payment, and
  clinical rules belong in versioned policy/configuration or governed reference data
  with provenance and effective dates. They must not be scattered through feature
  code.
- Controlled catalogues (including professions, specialties, services, regulators,
  and credential types) must be database-backed, auditable, additive, and safely
  deactivatable. User interfaces must consume the catalogue API rather than duplicate
  hard-coded option lists.
- Tests and synthetic seeds must cover more than one country, currency, time zone, and
  locale whenever the changed capability handles those concepts. A country-specific
  fixture never establishes a production default.

## Database and data integrity

- PostgreSQL is the production system of record. The prototype SQLite database must
  never become a production dependency or be mutated in place during migration.
- Design schemas around domain invariants and future-safe ownership boundaries. Use
  foreign keys, unique/check constraints, bounded states, UTC timestamps, provenance,
  and indexes that match demonstrated access paths.
- Use explicit transactions for multi-record invariants. Financial, attribution,
  audit, and clinical history must be append-only or versioned where required by the
  production plan; never rely on destructive overwrite for immutable facts.
- Every migration must have clean-install, upgrade, rollback/repair, backup/restore,
  and production-data-safety considerations. Never use `db push` in a production path.
- Queries must enforce authorization and tenancy in their predicates, select only
  required fields, paginate growing collections, avoid N+1 behavior, and include
  index/query-plan evidence when a new production access path is introduced.

## Security, privacy, and performance

- Apply least privilege, default deny, server-derived identity, data minimization,
  secure defaults, bounded inputs, and defense in depth. Never expose a sensitive
  field merely because the current UI does not render it.
- Do not log credentials, tokens, health/clinical data, payment details, confidential
  application content, or unbounded request bodies. Redaction behavior requires tests.
- External calls require explicit timeouts, idempotency where side effects are
  possible, bounded retry, and observable failure handling.
- Set measurable budgets for query count, pagination, payload size, latency, resource
  use, and queue behavior where relevant. Optimize from evidence without accepting an
  obviously unbounded or structurally inefficient design.
- Do not claim that software is bug-free. Instead, complete proportionate automated,
  integration, failure-mode, security, and manual verification; ship with no known
  unresolved critical/high defect or regression in the changed scope.

## Avoid

- Over-engineering (no speculative abstractions, no premature microservices — plan §4)
- Magic values (name constants and configuration explicitly — plan §6)
- Hard-coded assumptions (validate configuration at startup; no environment guesses —
  plan Increment 02)

## Post-implementation obligations

1. After every implementation, verify the result against every item in the two lists
   above and include that maintainability check in the walkthrough/completion report
   (plan §20 requires an explicit confirmation).
2. After every completed implementation, commit with a standard conventional commit
   message (e.g. `feat(api): ...`, `fix(web): ...`, `docs(baseline): ...`).

   Author identity for all commits in this repository:

   - Name: `Daniel130me`
   - Email: `kosokodaniel@gmail.com`

3. Execute the plan's increments strictly in order (§19) and update
   `docs/IMPLEMENTATION_PROGRESS.md` as work advances. Produce the §20 completion
   report after every increment. Under the product owner's standing authorization,
   continue between increment gates after validation, commit, and push; stop only for
   a material product, security, legal, infrastructure-cost, or production-data
   decision.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
