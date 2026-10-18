import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ appointmentId: string }> },
) {
  return context.params.then(({ appointmentId }) =>
    proxyAuthenticatedApi(
      request,
      `/v1/appointments/${encodeURIComponent(appointmentId)}/intake-consent/revoke`,
      "POST",
    ),
  );
}
