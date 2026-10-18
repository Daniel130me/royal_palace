import type { NextRequest } from "next/server";

import { proxyAppointmentList } from "@/lib/auth/scheduling-bff";

export function GET(request: NextRequest) {
  return proxyAppointmentList(request, "patient");
}
