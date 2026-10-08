import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function exactUuid(value: string | undefined): string | null {
  return value !== undefined && UUID.test(value) ? value : null;
}

export function pharmacyBffNotFound(): NextResponse {
  return NextResponse.json(
    { error: "route_not_found", message: "The requested pharmacy operation is not available" },
    { status: 404 },
  );
}
