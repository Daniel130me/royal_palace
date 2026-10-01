import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ practitionerId: string }> },
) {
  return context.params.then(({ practitionerId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/admin/practitioners/${encodeURIComponent(practitionerId)}/consultation-fees`,
      "POST",
    ),
  );
}
