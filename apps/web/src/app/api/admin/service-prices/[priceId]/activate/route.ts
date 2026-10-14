import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(request: NextRequest, context: { params: Promise<{ priceId: string }> }) {
  return context.params.then(({ priceId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/admin/service-prices/${encodeURIComponent(priceId)}/activate`,
      "POST",
    ),
  );
}
