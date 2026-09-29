import { loadWebConfig } from "@royal-palace/config/environment";
import { type NextRequest, NextResponse } from "next/server";

const config = loadWebConfig();
const FORWARDED_HEADERS = ["x-request-id", "traceparent"] as const;

export async function proxyPublicGet(request: NextRequest, apiPath: string): Promise<NextResponse> {
  const upstreamUrl = new URL(apiPath, config.apiBaseUrl);
  upstreamUrl.search = request.nextUrl.search;
  const headers = new Headers({ accept: "application/json" });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      headers,
      method: "GET",
      signal: AbortSignal.timeout(config.bffApiTimeoutMs),
    });
    return new NextResponse(upstream.body, {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
      status: upstream.status,
    });
  } catch {
    return NextResponse.json(
      { error: "discovery_service_unavailable", message: "Public discovery is unavailable" },
      { status: 503 },
    );
  }
}
