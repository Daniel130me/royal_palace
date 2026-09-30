import { createHash } from "node:crypto";

const CURSOR_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

export interface DiscoveryCursor {
  displayName: string;
  filterHash: string;
  id: string;
  version: 1;
}

export class InvalidDiscoveryCursorError extends Error {}

export function normalizeFilters<T extends object>(filters: T): T {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as T;
}

export function hashFilters(filters: object): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

export function encodeCursor(cursor: DiscoveryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string, expectedFilterHash: string): DiscoveryCursor {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error();
    const cursor = JSON.parse(decoded) as Partial<DiscoveryCursor>;
    if (
      Object.keys(cursor).sort().join(",") !== "displayName,filterHash,id,version" ||
      cursor.version !== CURSOR_VERSION ||
      typeof cursor.displayName !== "string" ||
      cursor.displayName.length < 1 ||
      cursor.displayName.length > 160 ||
      typeof cursor.id !== "string" ||
      !UUID_PATTERN.test(cursor.id) ||
      typeof cursor.filterHash !== "string" ||
      !SHA_256_PATTERN.test(cursor.filterHash) ||
      cursor.filterHash !== expectedFilterHash
    ) {
      throw new Error();
    }
    return cursor as DiscoveryCursor;
  } catch {
    throw new InvalidDiscoveryCursorError("The discovery cursor is invalid or expired");
  }
}
