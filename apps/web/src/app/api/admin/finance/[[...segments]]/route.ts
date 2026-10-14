import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const path = segments.length === 1 && ["settlements", "payouts"].includes(segments[0] ?? "")
      ? `/v1/admin/finance/${segments[0]}${request.nextUrl.search}`
      : null;
    return path === null
      ? Response.json({ error: "not_found", message: "Route not found" }, { status: 404 })
      : proxyAuthenticatedApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const payoutId = segments[0] === "payouts" ? segments[1] : undefined;
    return payoutId !== undefined && segments.length === 3 && segments[2] === "review"
      ? proxyAuthenticatedApi(request, `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}/review`, "POST")
      : Response.json({ error: "not_found", message: "Route not found" }, { status: 404 });
  });
}
