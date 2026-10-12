import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOKING_STATUS = new Set([
  "CONFIRMED",
  "SAMPLE_COLLECTION_PENDING",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "RESULT_READY",
  "COMPLETED",
  "CANCELLED",
]);

export function exactLaboratoryUuid(value: string | undefined): string | null {
  return value !== undefined && UUID.test(value) ? value : null;
}

export function laboratoryBffNotFound(): NextResponse {
  return NextResponse.json(
    { error: "route_not_found", message: "The requested laboratory operation is not available" },
    { status: 404 },
  );
}

/** Copies only bounded, indexed laboratory queue filters. */
export function laboratoryQueuePath(requestUrl: URL): string | null {
  const output = new URLSearchParams();
  for (const [name, value] of requestUrl.searchParams) {
    if (name === "cursor") {
      if (value.length < 1 || value.length > 1024) return null;
    } else if (name === "limit") {
      if (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 50) return null;
    } else if (name === "status") {
      if (!BOOKING_STATUS.has(value)) return null;
    } else {
      return null;
    }
    output.append(name, value);
  }
  const query = output.toString();
  return query.length === 0 ? "/v1/laboratory/bookings" : `/v1/laboratory/bookings?${query}`;
}
