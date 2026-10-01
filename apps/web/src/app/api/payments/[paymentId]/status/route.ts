import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest, context: { params: Promise<{ paymentId: string }> }) {
  return context.params.then(({ paymentId }) =>
    proxyAuthenticatedApi(request, `/v1/payments/${encodeURIComponent(paymentId)}/status`, "GET"),
  );
}
