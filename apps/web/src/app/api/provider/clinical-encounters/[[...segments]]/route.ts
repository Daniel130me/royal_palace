import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { clinicalBffNotFound, exactClinicalUuid } from "@/lib/auth/clinical-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 0) {
    return proxyAuthenticatedList(request, "/v1/provider/clinical-encounters", {
      allowPatientId: true,
    });
  }
  const encounterId = segments.length === 1 ? exactClinicalUuid(segments[0]) : null;
  return encounterId === null
    ? clinicalBffNotFound()
    : proxyAuthenticatedApi(request, `/v1/provider/clinical-encounters/${encounterId}`, "GET");
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 0) {
    return proxyAuthenticatedApi(request, "/v1/provider/clinical-encounters", "POST");
  }
  const encounterId = exactClinicalUuid(segments[0]);
  if (
    encounterId !== null &&
    segments.length === 2 &&
    ["drafts", "sign", "addenda", "related-actions"].includes(segments[1]!)
  ) {
    return proxyAuthenticatedApi(
      request,
      `/v1/provider/clinical-encounters/${encounterId}/${segments[1]}`,
      "POST",
    );
  }
  return clinicalBffNotFound();
}
