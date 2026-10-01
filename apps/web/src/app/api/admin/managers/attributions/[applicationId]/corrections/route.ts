import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export async function POST(request: NextRequest, route: RouteContext) {
  const applicationId = encodeURIComponent((await route.params).applicationId);
  return proxyAuthenticatedApi(
    request,
    `/v1/admin/managers/attributions/${applicationId}/corrections`,
    "POST",
  );
}

interface RouteContext {
  params: Promise<{ applicationId: string }>;
}
