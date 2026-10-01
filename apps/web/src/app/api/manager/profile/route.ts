import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

export function GET(request: NextRequest) {
  return proxyAuthenticatedApi(request, "/v1/manager/profile", "GET");
}
