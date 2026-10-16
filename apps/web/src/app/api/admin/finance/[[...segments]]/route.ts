import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const direct =
      segments.length === 1 && ["settlements", "statements", "payouts"].includes(segments[0] ?? "");
    const summary = segments.length === 2 && segments[0] === "reports" && segments[1] === "summary";
    const path = direct
      ? `/v1/admin/finance/${segments[0]}${request.nextUrl.search}`
      : summary
        ? `/v1/admin/finance/reports/summary${request.nextUrl.search}`
        : null;
    return path === null
      ? Response.json({ error: "not_found", message: "Route not found" }, { status: 404 })
      : proxyAuthenticatedApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const payoutId = segments[0] === "payouts" ? segments[1] : undefined;
    if (segments.length === 1 && segments[0] === "statements") {
      return proxyAuthenticatedApi(request, "/v1/admin/finance/statements", "POST");
    }
    const action = segments[2];
    return payoutId !== undefined &&
      segments.length === 3 &&
      ["review", "execute"].includes(action ?? "")
      ? proxyAuthenticatedApi(
          request,
          `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}/${action}`,
          "POST",
        )
      : Response.json({ error: "not_found", message: "Route not found" }, { status: 404 });
  });
}
