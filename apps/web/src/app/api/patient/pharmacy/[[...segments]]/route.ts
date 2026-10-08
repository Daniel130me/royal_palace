import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedList } from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && ["quotes", "orders"].includes(segments[0]!)) {
    return proxyAuthenticatedList(request, `/v1/patient/pharmacy/${segments[0]}`);
  }
  const resourceId = exactUuid(segments[1]);
  return resourceId !== null && segments.length === 2 && ["quotes", "orders"].includes(segments[0]!)
    ? proxyAuthenticatedApi(request, `/v1/patient/pharmacy/${segments[0]}/${resourceId}`, "GET")
    : pharmacyBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const resourceId = exactUuid(segments[1]);
  if (resourceId === null || segments.length !== 3) return pharmacyBffNotFound();
  const action = segments[0] === "quotes" ? "accept" : segments[0] === "orders" ? "cancel" : null;
  return action !== null && segments[2] === action
    ? proxyAuthenticatedApi(
        request,
        `/v1/patient/pharmacy/${segments[0]}/${resourceId}/${action}`,
        "POST",
      )
    : pharmacyBffNotFound();
}
