import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function POST(request: NextRequest, route: RouteContext) {
  const policyId = encodeURIComponent((await route.params).policyId);
  return proxyAuthenticatedApi(
    request,
    `/v1/admin/managers/commission-policies/${policyId}/activate`,
    "POST",
  );
}

interface RouteContext {
  params: Promise<{ policyId: string }>;
}
