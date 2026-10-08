import type { NextRequest } from "next/server";

import {
  proxyAuthenticatedApi,
  proxyAuthenticatedList,
  proxyAuthenticatedOrganizationApi,
} from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && ["prescriptions", "quotes", "orders"].includes(segments[0]!)) {
    return proxyAuthenticatedList(request, `/v1/pharmacy/${segments[0]}`, {
      requireOrganization: true,
    });
  }
  const resourceId = exactUuid(segments[1]);
  return resourceId !== null && segments.length === 2 && ["quotes", "orders"].includes(segments[0]!)
    ? proxyAuthenticatedApi(request, `/v1/pharmacy/${segments[0]}/${resourceId}`, "GET")
    : pharmacyBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const resourceId = exactUuid(segments[1]);
  if (resourceId === null) return pharmacyBffNotFound();
  if (
    segments[0] === "prescriptions" &&
    segments.length === 3 &&
    ["accept", "substitutions", "dispense", "return", "quotes"].includes(segments[2]!)
  ) {
    return proxyAuthenticatedOrganizationApi(
      request,
      `/v1/pharmacy/prescriptions/${resourceId}/${segments[2]}`,
      "POST",
    );
  }
  if (segments[0] === "orders" && segments.length === 3 && segments[2] === "handoff") {
    return proxyAuthenticatedOrganizationApi(
      request,
      `/v1/pharmacy/orders/${resourceId}/handoff`,
      "POST",
    );
  }
  if (
    segments[0] === "orders" &&
    segments.length === 4 &&
    segments[2] === "handoff" &&
    segments[3] === "complete"
  ) {
    return proxyAuthenticatedOrganizationApi(
      request,
      `/v1/pharmacy/orders/${resourceId}/handoff/complete`,
      "POST",
    );
  }
  return pharmacyBffNotFound();
}
