import type { NextRequest } from "next/server";

import { proxyPatientPaymentList } from "@/lib/auth/scheduling-bff";

export function GET(request: NextRequest) {
  return proxyPatientPaymentList(request);
}
