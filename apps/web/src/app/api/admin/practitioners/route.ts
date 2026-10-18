import type { NextRequest } from "next/server";

import { proxyAdminPractitionerList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminPractitionerList(request);
}
