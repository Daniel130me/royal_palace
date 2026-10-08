import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  return segments.length === 0
    ? proxyAuthenticatedList(request, "/v1/patient/prescriptions")
    : pharmacyBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const prescriptionId = exactUuid(segments[0]);
  if (prescriptionId !== null && segments.length === 2 && segments[1] === "send") {
    return proxyAuthenticatedApi(
      request,
      `/v1/patient/prescriptions/${prescriptionId}/send`,
      "POST",
    );
  }
  const proposalId = exactUuid(segments[2]);
  if (
    prescriptionId !== null &&
    proposalId !== null &&
    segments.length === 4 &&
    segments[1] === "substitutions" &&
    segments[3] === "consent"
  ) {
    return proxyAuthenticatedApi(
      request,
      `/v1/patient/prescriptions/${prescriptionId}/substitutions/${proposalId}/consent`,
      "POST",
    );
  }
  return pharmacyBffNotFound();
}
