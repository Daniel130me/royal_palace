import type { NextRequest } from "next/server";

import { proxyAdminDashboard } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminDashboard(request);
}
