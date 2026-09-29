import type { NextRequest, NextResponse } from "next/server";

import { proxyPublicGet } from "@/lib/public-api";

const HOSPITAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hospitalId: string }> },
): Promise<NextResponse> {
  const { hospitalId } = await context.params;
  if (!HOSPITAL_ID.test(hospitalId)) {
    const { NextResponse } = await import("next/server");
    return NextResponse.json(
      { error: "invalid_request", message: "Hospital identifier is invalid" },
      { status: 400 },
    );
  }
  return proxyPublicGet(request, `/v1/public/hospitals/${hospitalId}`);
}
