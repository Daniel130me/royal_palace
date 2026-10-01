import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function POST(request: NextRequest, route: RouteContext) {
  const ticketId = encodeURIComponent((await route.params).ticketId);
  return proxyAuthenticatedApi(request, `/v1/manager/tickets/${ticketId}/follow-ups`, "POST");
}

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}
