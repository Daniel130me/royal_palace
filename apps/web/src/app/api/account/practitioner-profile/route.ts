import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

const target = "/v1/account/practitioner-profile";

export function GET(request: NextRequest) {
  return proxyAuthenticatedApi(request, target, "GET");
}

export function PATCH(request: NextRequest) {
  return proxyAuthenticatedApi(request, target, "PATCH");
}
