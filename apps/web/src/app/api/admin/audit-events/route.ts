import type { NextRequest } from "next/server";

import { proxyAdminAuditList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminAuditList(request);
}
