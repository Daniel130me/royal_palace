import type { NextRequest } from "next/server";

import { proxyAdminComplaintList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminComplaintList(request);
}
