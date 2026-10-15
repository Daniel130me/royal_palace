import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { clinicalBffNotFound, exactClinicalUuid } from "@/lib/auth/clinical-bff";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await context.params;
  if (segments.length === 0) {
    return proxyAuthenticatedList(request, "/v1/patient/clinical-encounters");
  }
  const encounterId = segments.length === 1 ? exactClinicalUuid(segments[0]) : null;
  return encounterId === null
    ? clinicalBffNotFound()
    : proxyAuthenticatedApi(request, `/v1/patient/clinical-encounters/${encounterId}`, "GET");
}
