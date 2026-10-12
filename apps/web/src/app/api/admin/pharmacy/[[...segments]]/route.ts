import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import {
  adminPharmacyOrderListPath,
  exactUuid,
  pharmacyBffNotFound,
} from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === "orders") {
    const path = adminPharmacyOrderListPath(request.nextUrl, "/v1/admin/pharmacy/orders");
    return path === null ? pharmacyBffNotFound() : proxyAuthenticatedApi(request, path, "GET");
  }
  const orderId = exactUuid(segments[1]);
  return segments.length === 2 && segments[0] === "orders" && orderId !== null
    ? proxyAuthenticatedApi(request, `/v1/admin/pharmacy/orders/${orderId}`, "GET")
    : pharmacyBffNotFound();
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  const orderId = exactUuid(segments[1]);
  return segments.length === 3 &&
    segments[0] === "orders" &&
    orderId !== null &&
    segments[2] === "disputes"
    ? proxyAuthenticatedApi(request, `/v1/admin/pharmacy/orders/${orderId}/disputes`, "POST")
    : pharmacyBffNotFound();
}
