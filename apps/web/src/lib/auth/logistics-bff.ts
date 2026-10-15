import { NextResponse } from "next/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = new Set([
  "ASSIGNED",
  "ACCEPTED",
  "HEADING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKUP_VERIFIED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
]);

export function exactLogisticsUuid(value: string | undefined): string | null {
  return value !== undefined && UUID_PATTERN.test(value) ? value : null;
}

export function logisticsListPath(url: URL, upstreamPath: string): string | null {
  const output = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key === "cursor" && value.length > 0 && value.length <= 1_024) output.set(key, value);
    else if (
      key === "limit" &&
      /^\d{1,2}$/.test(value) &&
      Number(value) >= 1 &&
      Number(value) <= 50
    )
      output.set(key, value);
    else if (key === "status" && STATUS.has(value)) output.set(key, value);
    else return null;
  }
  const query = output.toString();
  return query.length === 0 ? upstreamPath : `${upstreamPath}?${query}`;
}

export function logisticsHistoryPath(url: URL, upstreamPath: string): string | null {
  const entries = [...url.searchParams];
  if (entries.length === 0) return upstreamPath;
  if (entries.length !== 1 || entries[0]?.[0] !== "limit") return null;
  const limit = entries[0][1];
  return /^\d{1,3}$/.test(limit) && Number(limit) >= 1 && Number(limit) <= 100
    ? `${upstreamPath}?limit=${limit}`
    : null;
}

export function logisticsBffNotFound(): NextResponse {
  return NextResponse.json({ error: "not_found", message: "Route was not found" }, { status: 404 });
}
