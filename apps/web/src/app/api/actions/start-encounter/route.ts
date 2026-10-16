import { NextResponse } from "next/server";

/**
 * An explicit tombstone makes stale prototype clients fail closed instead of
 * writing to the retired SQLite clinical store.
 */
export function POST() {
  return NextResponse.json(
    { error: "The prototype encounter endpoint has been retired." },
    { status: 410 },
  );
}
