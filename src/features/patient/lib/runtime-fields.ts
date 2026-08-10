// Helper for reading Prisma-generated timestamp fields (createdAt / updatedAt)
// that exist on the runtime rows returned by the API but are intentionally
// omitted from the strict domain types in `src/types/index.ts` (to keep the
// public type surface minimal). Casting at the call site keeps strict typing
// without resorting to `any`.

export function createdAt(row: unknown): string | undefined {
  return readField(row, "createdAt");
}

export function updatedAt(row: unknown): string | undefined {
  return readField(row, "updatedAt");
}

function readField(row: unknown, field: string): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const v = (row as Record<string, unknown>)[field];
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return undefined;
}
