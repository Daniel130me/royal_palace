import { NextResponse } from "next/server";

/**
 * An explicit tombstone makes stale prototype clients fail closed instead of
 * signing records in the retired SQLite clinical store.
 */
export function PATCH() {
  return NextResponse.json(
    { error: "The prototype encounter endpoint has been retired." },
    { status: 410 },
  );
}
