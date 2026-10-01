import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function GET(request: NextRequest, route: RouteContext) {
  const ticketId = encodeURIComponent((await route.params).ticketId);
  return proxyAuthenticatedApi(request, `/v1/manager/tickets/${ticketId}`, "GET");
}

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}
