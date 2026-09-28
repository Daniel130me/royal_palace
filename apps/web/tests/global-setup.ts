// One throwaway SQLite database is prepared for the complete prototype test run.
// Global setup runs before Vitest starts workers, so every worker inherits the same
// explicit DATABASE_URL without racing to apply the schema.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export default function prepareTestDatabase(): () => void {
  const prismaDirectory = path.join(process.cwd(), "prisma");
  const directory = mkdtempSync(path.join(prismaDirectory, ".test-"));
  const databaseUrl = `file:./${path.basename(directory)}/test.db`;
  // The Windows Prisma schema engine cannot always create a file inside a newly
  // created directory, although it can safely initialize an existing empty file.
  writeFileSync(path.join(directory, "test.db"), "", { flag: "wx" });
  const require = createRequire(import.meta.url);
  const prismaPackagePath = require.resolve("prisma/package.json");
  const prismaPackage: unknown = JSON.parse(readFileSync(prismaPackagePath, "utf8"));
  const prismaBin = readPrismaBin(prismaPackage);
  const prismaCli = path.resolve(path.dirname(prismaPackagePath), prismaBin);

  process.env.DATABASE_URL = databaseUrl;

  try {
    execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    console.error("[tests/global-setup] failed to prepare the temporary test database", error);
    throw error;
  }

  return () => {
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  };
}

function readPrismaBin(value: unknown): string {
  if (typeof value !== "object" || value === null || !("bin" in value)) {
    throw new Error("Prisma package does not declare a CLI executable");
  }
  const bin = value.bin;
  if (typeof bin === "string") return bin;
  if (
    typeof bin === "object" &&
    bin !== null &&
    "prisma" in bin &&
    typeof bin.prisma === "string"
  ) {
    return bin.prisma;
  }
  throw new Error("Prisma package does not declare the expected CLI executable");
}
