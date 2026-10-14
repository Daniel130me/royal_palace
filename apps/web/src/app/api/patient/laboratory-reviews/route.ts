import type { NextRequest } from "next/server";

import { proxyAuthenticatedList } from "@/lib/auth/bff";

export function GET(request: NextRequest) {
  return proxyAuthenticatedList(request, "/v1/patient/laboratory-reviews");
}
