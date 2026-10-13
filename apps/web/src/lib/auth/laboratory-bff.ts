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
const RESULT_STATUS = new Set(["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED"]);
const CRITICAL_RESULT_STATUS = new Set(["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"]);

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
  return laboratoryListPath("/v1/laboratory/bookings", requestUrl, BOOKING_STATUS);
}

export function laboratoryResultListPath(
  basePath: string,
  requestUrl: URL,
  kind: "critical" | "result" | "published",
): string | null {
  return laboratoryListPath(
    basePath,
    requestUrl,
    kind === "critical" ? CRITICAL_RESULT_STATUS : kind === "result" ? RESULT_STATUS : null,
  );
}

function laboratoryListPath(
  basePath: string,
  requestUrl: URL,
  allowedStatuses: ReadonlySet<string> | null,
): string | null {
  const output = new URLSearchParams();
  for (const [name, value] of requestUrl.searchParams) {
    if (name === "cursor") {
      if (value.length < 1 || value.length > 1024) return null;
    } else if (name === "limit") {
      if (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 50) return null;
    } else if (name === "status") {
      if (allowedStatuses === null || !allowedStatuses.has(value)) return null;
    } else {
      return null;
    }
    output.append(name, value);
  }
  const query = output.toString();
  return query.length === 0 ? basePath : `${basePath}?${query}`;
}
