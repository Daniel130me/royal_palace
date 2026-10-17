import { createHash } from "node:crypto";

import { z } from "zod";

import type { AdministrationCursor } from "../domain/administration.types.js";

const cursorSchema = z
  .object({
    filterHash: z.string().length(64),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
    version: z.literal(1),
  })
  .strict();

export class InvalidAdministrationCursorError extends Error {
  constructor() {
    super("The pagination cursor is invalid for this query");
    this.name = "InvalidAdministrationCursorError";
  }
}

export function administrationFilterHash(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

export function decodeAdministrationCursor(
  encoded: string | undefined,
  expectedFilterHash: string,
): AdministrationCursor | undefined {
  if (encoded === undefined) return undefined;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (parsed.filterHash !== expectedFilterHash) throw new InvalidAdministrationCursorError();
    return { id: parsed.id, timestamp: new Date(parsed.timestamp) };
  } catch (error) {
    if (error instanceof InvalidAdministrationCursorError) throw error;
    throw new InvalidAdministrationCursorError();
  }
}

export function encodeAdministrationCursor(
  cursor: AdministrationCursor,
  filterHash: string,
): string {
  return Buffer.from(
    JSON.stringify({
      filterHash,
      id: cursor.id,
      timestamp: cursor.timestamp.toISOString(),
      version: 1,
    }),
  ).toString("base64url");
}
