import type { NextRequest } from "next/server";

import { proxyAdminDeliveryList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminDeliveryList(request);
}
