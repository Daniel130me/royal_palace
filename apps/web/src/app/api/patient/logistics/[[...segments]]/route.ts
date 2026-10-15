import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import {
  exactLogisticsUuid,
  logisticsBffNotFound,
  logisticsListPath,
} from "@/lib/auth/logistics-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === "deliveries") {
    const path = logisticsListPath(request.nextUrl, "/v1/patient/logistics/deliveries");
    return path === null ? logisticsBffNotFound() : proxyAuthenticatedApi(request, path, "GET");
  }
  const deliveryId = exactLogisticsUuid(segments[1]);
  return segments.length === 2 && segments[0] === "deliveries" && deliveryId !== null
    ? proxyAuthenticatedApi(request, `/v1/patient/logistics/deliveries/${deliveryId}`, "GET")
    : logisticsBffNotFound();
}
