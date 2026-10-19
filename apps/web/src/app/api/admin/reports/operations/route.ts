import type { NextRequest } from "next/server";

import { proxyAdminOperationalReport } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminOperationalReport(request);
}
