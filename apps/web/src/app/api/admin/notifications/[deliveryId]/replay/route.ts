import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(request: NextRequest, context: { params: Promise<{ deliveryId: string }> }) {
  return context.params.then(({ deliveryId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/admin/notifications/${encodeURIComponent(deliveryId)}/replay`,
      "POST",
    ),
  );
}
