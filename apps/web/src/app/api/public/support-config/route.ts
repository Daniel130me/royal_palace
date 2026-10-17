import { loadWebConfig } from "@royal-palace/config/environment";
import type { PublicSupportConfigResponse } from "@royal-palace/contracts";
import { NextResponse } from "next/server";

export function GET(): NextResponse<PublicSupportConfigResponse> {
  const config = loadWebConfig();
  return NextResponse.json(config.publicSupport, {
    headers: {
      // Support details are public deployment configuration and may be cached briefly.
      "cache-control": "public, max-age=300, stale-while-revalidate=300",
    },
  });
}
