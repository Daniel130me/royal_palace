import type { NextRequest, NextResponse } from "next/server";

import { proxyPublicGet } from "@/lib/public-api";

export function GET(request: NextRequest): Promise<NextResponse> {
  return proxyPublicGet(request, "/v1/public/laboratories");
}
