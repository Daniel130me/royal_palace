import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export const apiRoot = fileURLToPath(new URL("..", import.meta.url));
export const prismaRoot = fileURLToPath(new URL("../prisma", import.meta.url));

export function requireDisposableDatabase(): URL {
  if (process.env.APP_ENV !== "test" || process.env.DATABASE_MIGRATION_VERIFY !== "true") {
    throw new Error(
      "Database verification requires APP_ENV=test and DATABASE_MIGRATION_VERIFY=true",
    );
  }

  const url = new URL(requiredEnvironment("DATABASE_URL"));
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error("Database verification may only target a loopback PostgreSQL host");
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (databaseName.length === 0 || ["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error("DATABASE_URL must name a disposable, non-system database");
  }

  return url;
}

export function databaseUrlWithName(base: URL, databaseName: string): string {
  const target = new URL(base);
  target.pathname = `/${encodeURIComponent(databaseName)}`;
  return target.toString();
}

export function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

export async function runPrismaMigration(schemaPath: string, databaseUrl: string): Promise<void> {
  await runPnpm(["exec", "prisma", "migrate", "deploy", "--schema", schemaPath], {
    DATABASE_URL: databaseUrl,
  });
}

export async function runPnpm(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<void> {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli === undefined) {
    throw new Error("npm_execpath is unavailable; run this command through the pinned pnpm script");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, ...arguments_], {
      cwd: apiRoot,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with code ${String(code)}`));
    });
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
