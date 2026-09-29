import { type NextRequest, NextResponse } from "next/server";

import { proxyPublicGet } from "@/lib/public-api";

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
): Promise<NextResponse> {
  const { organizationId } = await context.params;
  if (!ORGANIZATION_ID.test(organizationId)) {
    return NextResponse.json(
      { error: "invalid_request", message: "Organization identifier is invalid" },
      { status: 400 },
    );
  }
  return proxyPublicGet(request, `/v1/public/pharmacies/${organizationId}`);
}
