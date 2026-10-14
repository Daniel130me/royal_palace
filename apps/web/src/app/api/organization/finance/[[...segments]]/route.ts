import type { NextRequest } from "next/server";

import { proxyAuthenticatedOrganizationApi } from "@/lib/auth/bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const path = segments.length === 1 && ["settlements", "payouts"].includes(segments[0] ?? "")
      ? `/v1/organization/finance/${segments[0]}${request.nextUrl.search}`
      : null;
    return path === null
      ? Response.json({ error: "not_found", message: "Route not found" }, { status: 404 })
      : proxyAuthenticatedOrganizationApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) =>
    segments.length === 1 && segments[0] === "payouts"
      ? proxyAuthenticatedOrganizationApi(request, "/v1/organization/finance/payouts", "POST")
      : Response.json({ error: "not_found", message: "Route not found" }, { status: 404 }),
  );
}
