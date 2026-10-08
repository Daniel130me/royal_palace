import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import { exactUuid, pharmacyBffNotFound } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

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
