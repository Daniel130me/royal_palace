import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactLaboratoryUuid, laboratoryBffNotFound } from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length === 0) {
      return proxyAuthenticatedList(request, "/v1/provider/laboratory-requests", {
        allowPatientId: true,
      });
    }
    const requestId = segments.length === 1 ? exactLaboratoryUuid(segments[0]) : null;
    return requestId === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedApi(request, `/v1/laboratory-requests/${requestId}`, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) =>
    segments.length === 0
      ? proxyAuthenticatedApi(request, "/v1/provider/laboratory-requests", "POST")
      : laboratoryBffNotFound(),
  );
}
