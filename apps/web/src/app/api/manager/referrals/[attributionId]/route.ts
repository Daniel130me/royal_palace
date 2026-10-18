import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest, context: { params: Promise<{ attributionId: string }> }) {
  return context.params.then(({ attributionId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/manager/referrals/${encodeURIComponent(attributionId)}`,
      "GET",
    ),
  );
}
