import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(request: NextRequest, context: { params: Promise<{ feeId: string }> }) {
  return context.params.then(({ feeId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/admin/consultation-fees/${encodeURIComponent(feeId)}/activate`,
      "POST",
    ),
  );
}
