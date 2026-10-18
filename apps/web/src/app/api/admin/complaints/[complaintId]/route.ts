import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function PATCH(request: NextRequest, context: { params: Promise<{ complaintId: string }> }) {
  return context.params.then(({ complaintId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/admin/complaints/${encodeURIComponent(complaintId)}`,
      "PATCH",
    ),
  );
}
