import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactLaboratoryUuid, laboratoryBffNotFound } from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length === 0) {
      return proxyAuthenticatedList(request, "/v1/patient/laboratory-requests");
    }
    const requestId = segments.length === 1 ? exactLaboratoryUuid(segments[0]) : null;
    return requestId === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedApi(request, `/v1/laboratory-requests/${requestId}`, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const requestId = segments.length === 2 ? exactLaboratoryUuid(segments[0]) : null;
    return requestId !== null && segments[1] === "bookings"
      ? proxyAuthenticatedApi(
          request,
          `/v1/patient/laboratory-requests/${requestId}/bookings`,
          "POST",
        )
      : laboratoryBffNotFound();
  });
}
