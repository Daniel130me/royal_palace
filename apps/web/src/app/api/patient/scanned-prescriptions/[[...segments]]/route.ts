import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 0) {
    return proxyAuthenticatedList(request, "/v1/patient/scanned-prescriptions");
  }
  const prescriptionId = exactUuid(segments[0]);
  if (prescriptionId === null) return pharmacyBffNotFound();
  if (segments.length === 1) {
    return proxyAuthenticatedApi(
      request,
      `/v1/patient/scanned-prescriptions/${prescriptionId}`,
      "GET",
    );
  }
  return segments.length === 2 && segments[1] === "download"
    ? proxyAuthenticatedApi(
        request,
        `/v1/patient/scanned-prescriptions/${prescriptionId}/download`,
        "GET",
      )
    : pharmacyBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === "upload-intents") {
    return proxyAuthenticatedApi(
      request,
      "/v1/patient/scanned-prescriptions/upload-intents",
      "POST",
    );
  }
  const prescriptionId = exactUuid(segments[0]);
  return prescriptionId !== null && segments.length === 2 && segments[1] === "complete"
    ? proxyAuthenticatedApi(
        request,
        `/v1/patient/scanned-prescriptions/${prescriptionId}/complete`,
        "POST",
      )
    : pharmacyBffNotFound();
}
