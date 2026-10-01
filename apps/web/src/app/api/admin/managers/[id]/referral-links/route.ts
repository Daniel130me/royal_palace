import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function POST(request: NextRequest, route: RouteContext) {
  const id = encodeURIComponent((await route.params).id);
  return proxyAuthenticatedApi(request, `/v1/admin/managers/${id}/referral-links`, "POST");
}

interface RouteContext {
  params: Promise<{ id: string }>;
}
