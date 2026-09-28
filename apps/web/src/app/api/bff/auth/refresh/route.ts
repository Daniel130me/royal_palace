import { type NextRequest, NextResponse } from "next/server";

import {
  authErrorResponse,
  callIdentityApi,
  readSessionId,
  requestId,
  requireCsrf,
} from "@/lib/auth/bff";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireCsrf(request);
    await callIdentityApi(
      "/v1/internal/auth/session/refresh",
      { sessionId: readSessionId(request) },
      requestId(request),
    );
    return NextResponse.json({ refreshed: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
