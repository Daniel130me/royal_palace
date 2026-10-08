import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const prescriptionId = exactUuid(segments[0]);
  if (prescriptionId === null) return pharmacyBffNotFound();
  if (segments.length === 1) {
    return proxyAuthenticatedApi(request, `/v1/prescriptions/${prescriptionId}`, "GET");
  }
  return segments.length === 2 && segments[1] === "dispense-events"
    ? proxyAuthenticatedList(request, `/v1/prescriptions/${prescriptionId}/dispense-events`)
    : pharmacyBffNotFound();
}
