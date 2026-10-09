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

/** Copies only the inventory query parameters defined by the production contract. */
export function pharmacyInventoryListPath(requestUrl: URL, apiPath: string): string | null {
  const output = new URLSearchParams();
  for (const [name, value] of requestUrl.searchParams) {
    if (["categoryId", "catalogItemId", "lotId"].includes(name)) {
      if (!UUID.test(value)) return null;
    } else if (name === "cursor") {
      if (value.length < 1 || value.length > 1024) return null;
    } else if (name === "limit") {
      if (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 50) return null;
    } else if (name === "q") {
      if (value.trim().length < 2 || value.length > 120) return null;
    } else if (name === "status") {
      if (
        ![
          "ACTIVE",
          "INACTIVE",
          "AVAILABLE",
          "QUARANTINED",
          "DEPLETED",
          "EXPIRED",
          "RECALLED",
        ].includes(value)
      )
        return null;
    } else if (name === "kind") {
      if (!["CATEGORY", "DOSAGE_FORM"].includes(value)) return null;
    } else {
      return null;
    }
    output.append(name, value);
  }
  const query = output.toString();
  return query.length === 0 ? apiPath : `${apiPath}?${query}`;
}
