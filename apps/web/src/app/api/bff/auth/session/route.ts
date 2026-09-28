import type { CurrentSession } from "@royal-palace/contracts";
import { type NextRequest, NextResponse } from "next/server";

import {
  authErrorResponse,
  callIdentityApi,
  clearAuthCookies,
  readSessionId,
  requestId,
} from "@/lib/auth/bff";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await callIdentityApi<CurrentSession>(
      "/v1/internal/auth/session/current",
      { sessionId: readSessionId(request) },
      requestId(request),
    );
    return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status === 401) clearAuthCookies(response);
    return response;
  }
}
