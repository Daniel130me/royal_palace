import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function POST(request: NextRequest) {
  return proxyAuthenticatedApi(request, "/v1/payments/checkout-sessions", "POST");
}
