// Vitest global setup for the Manager module tests.
// Every test run gets a throwaway SQLite database so tests never touch the
// seeded demo database (db/custom.db). The schema is pushed with an explicit
// DATABASE_URL because the sandbox environment may carry a global override.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "royal-palace-test-"));
const dbPath = path.join(dir, "test.db");

// Must be set BEFORE any test file imports @/lib/db.
process.env.DATABASE_URL = `file:${dbPath}`;

try {
  execSync("bunx prisma db push --skip-generate", {
    cwd: process.cwd(), // vitest always runs from the repository root
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "ignore",
  });
} catch (error) {
  console.error("[tests/setup] failed to prepare the temporary test database", error);
  throw error;
}

process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});
