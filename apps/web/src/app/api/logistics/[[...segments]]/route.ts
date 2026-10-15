import type { NextRequest } from "next/server";

import { proxyAuthenticatedOrganizationApi } from "@/lib/auth/bff";
import {
  exactLogisticsUuid,
  logisticsBffNotFound,
  logisticsHistoryPath,
  logisticsListPath,
} from "@/lib/auth/logistics-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === "deliveries") {
    const path = logisticsListPath(request.nextUrl, "/v1/logistics/deliveries");
    return path === null
      ? logisticsBffNotFound()
      : proxyAuthenticatedOrganizationApi(request, path, "GET");
  }
  const deliveryId = exactLogisticsUuid(segments[1]);
  if (deliveryId === null || segments[0] !== "deliveries") return logisticsBffNotFound();
  if (segments.length === 2) {
    return proxyAuthenticatedOrganizationApi(
      request,
      `/v1/logistics/deliveries/${deliveryId}`,
      "GET",
    );
  }
  if (segments.length === 3 && segments[2] === "history") {
    const path = logisticsHistoryPath(
      request.nextUrl,
      `/v1/logistics/deliveries/${deliveryId}/history`,
    );
    return path === null
      ? logisticsBffNotFound()
      : proxyAuthenticatedOrganizationApi(request, path, "GET");
  }
  return logisticsBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const deliveryId = exactLogisticsUuid(segments[1]);
  if (
    deliveryId === null ||
    segments.length !== 3 ||
    segments[0] !== "deliveries" ||
    !["courier-assignment", "transitions"].includes(segments[2]!)
  ) {
    return logisticsBffNotFound();
  }
  return proxyAuthenticatedOrganizationApi(
    request,
    `/v1/logistics/deliveries/${deliveryId}/${segments[2]}`,
    "POST",
  );
}
