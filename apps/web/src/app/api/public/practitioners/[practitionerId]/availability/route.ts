import type { NextRequest } from "next/server";

import { proxyPublicGet } from "@/lib/public-api";

export function GET(
  request: NextRequest,
  context: { params: Promise<{ practitionerId: string }> },
) {
  return context.params.then(({ practitionerId }) =>
    proxyPublicGet(
      request,
      `/v1/public/practitioners/${encodeURIComponent(practitionerId)}/availability`,
    ),
  );
}
