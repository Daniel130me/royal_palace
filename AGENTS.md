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
- Always flag non-standard implementations explicitly (in code comments, commit
  messages, and the increment completion report).
- Never disable type checking, linting, tests, authorization checks, or certificate
  verification to make a build pass (plan §13.11).

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

3. Execute the plan's increments strictly in order (§19). Stop at every approval gate.
   Produce the §20 completion report after every increment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
