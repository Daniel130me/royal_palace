import type { NextRequest } from "next/server";

import { proxyAdminAppointmentList } from "@/lib/auth/administration-bff";

export function GET(request: NextRequest) {
  return proxyAdminAppointmentList(request);
}
