import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest) {
  return proxyAuthenticatedApi(request, "/v1/admin/service-prices", "GET");
}

export function POST(request: NextRequest) {
  return proxyAuthenticatedApi(request, "/v1/admin/service-prices", "POST");
}
