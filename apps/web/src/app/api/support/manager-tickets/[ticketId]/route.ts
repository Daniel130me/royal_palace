import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function PATCH(request: NextRequest, route: RouteContext) {
  const ticketId = encodeURIComponent((await route.params).ticketId);
  return proxyAuthenticatedApi(request, `/v1/support/manager-tickets/${ticketId}`, "PATCH");
}

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}
