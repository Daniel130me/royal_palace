import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

type Context = { params: Promise<{ principalId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: Context) {
  const { principalId } = await context.params;
  if (!UUID_PATTERN.test(principalId)) {
    return Response.json(
      { error: "not_found", message: "Resource was not found" },
      { status: 404 },
    );
  }
  return proxyAuthenticatedApi(request, `/v1/admin/principals/${principalId}/status`, "PATCH");
}
