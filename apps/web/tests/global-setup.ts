// One throwaway SQLite database is prepared for the complete prototype test run.
// Global setup runs before Vitest starts workers, so every worker inherits the same
// explicit DATABASE_URL without racing to apply the schema.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

export default function prepareTestDatabase(): () => void {
  const prismaDirectory = path.join(process.cwd(), "prisma");
  const directory = mkdtempSync(path.join(prismaDirectory, ".test-"));
  const databaseUrl = `file:./${path.basename(directory)}/test.db`;
  const packageManagerCli = process.env.npm_execpath;

  if (packageManagerCli === undefined) {
    rmSync(directory, { force: true, recursive: true });
    throw new Error("npm_execpath is required to prepare the test database");
  }

  process.env.DATABASE_URL = databaseUrl;

  try {
    execFileSync(
      process.execPath,
      [packageManagerCli, "exec", "prisma", "db", "push", "--skip-generate"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "ignore",
      },
    );
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    console.error("[tests/global-setup] failed to prepare the temporary test database", error);
    throw error;
  }

  return () => {
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  };
}
