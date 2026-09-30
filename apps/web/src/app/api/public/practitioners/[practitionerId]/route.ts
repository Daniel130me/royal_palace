import type { NextRequest, NextResponse } from "next/server";

import { proxyPublicGet } from "@/lib/public-api";

interface RouteContext {
  params: Promise<{ practitionerId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { practitionerId } = await context.params;
  return proxyPublicGet(request, `/v1/public/practitioners/${encodeURIComponent(practitionerId)}`);
}
