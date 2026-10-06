# Dependency security exceptions

Exceptions are explicit, narrowly scoped, time-bounded, and enforced by
`scripts/audit-dependencies.mjs`. Production dependencies must always pass the high-severity
audit with no exceptions.

## GHSA-vfj7-8cjw-p6xm — `braces` — review by 2026-11-07

- **Exposure:** Development-only ESLint traversal through
  `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces@3.0.3`.
- **Product/runtime impact:** None. `pnpm audit --prod --audit-level high` is clean, and the
  affected package is not shipped in the application runtime or containers.
- **Threat condition:** Stack exhaustion requires an attacker-controlled, deeply nested glob
  pattern. Repository lint configuration is trusted source code and CI does not accept glob
  patterns from application users.
- **Why it is not upgraded now:** On 2026-10-07, the npm registry listed `3.0.3` as the newest
  `braces` release even though the advisory names `>=3.0.4` as patched. The latest Next.js ESLint
  plugin still depends on the same `fast-glob` line.
- **Enforcement:** CI permits only the named advisory, only version `3.0.3`, only dev findings,
  and only the exact Next.js ESLint dependency path. Any runtime exposure, path/version change,
  additional advisory, or passage of the review date fails CI.
- **Resolution:** Remove this exception and regenerate the lockfile as soon as a compatible
  patched package or upstream toolchain is published. Platform engineering owns the review.
