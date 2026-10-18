import type { NextRequest } from "next/server";

import { proxyAdminPrincipalList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminPrincipalList(request);
}
