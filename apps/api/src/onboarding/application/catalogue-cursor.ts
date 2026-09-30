import type { CatalogueEntryStatus, ClinicalCatalogueKind } from "@royal-palace/contracts";
import { z } from "zod";

const baseCursorSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["PROFESSION", "SPECIALTY"]),
  name: z.string().min(1).max(180),
  status: z.enum(["ACTIVE", "INACTIVE"]).nullable(),
  version: z.literal(1),
});
const cursorSchema = z.discriminatedUnion("kind", [
  baseCursorSchema.extend({ kind: z.literal("PROFESSION") }).strict(),
  baseCursorSchema
    .extend({ category: z.string().min(1).max(120), kind: z.literal("SPECIALTY") })
    .strict(),
]);

export type CatalogueCursor =
  | { id: string; kind: "PROFESSION"; name: string }
  | { category: string; id: string; kind: "SPECIALTY"; name: string };

export class InvalidCatalogueCursorError extends Error {
  constructor() {
    super("The catalogue cursor is invalid or does not match the current filters");
    this.name = "InvalidCatalogueCursorError";
  }
}

export function encodeCatalogueCursor(
  cursor: CatalogueCursor,
  status: CatalogueEntryStatus | undefined,
): string {
  return Buffer.from(
    JSON.stringify({ ...cursor, status: status ?? null, version: 1 }),
    "utf8",
  ).toString("base64url");
}

export function decodeCatalogueCursor(
  value: string,
  kind: ClinicalCatalogueKind,
  status: CatalogueEntryStatus | undefined,
): CatalogueCursor {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(decoded));
    if (cursor.kind !== kind || cursor.status !== (status ?? null)) throw new Error();
    return cursor.kind === "PROFESSION"
      ? { id: cursor.id, kind: cursor.kind, name: cursor.name }
      : {
          category: cursor.category,
          id: cursor.id,
          kind: cursor.kind,
          name: cursor.name,
        };
  } catch {
    throw new InvalidCatalogueCursorError();
  }
}
