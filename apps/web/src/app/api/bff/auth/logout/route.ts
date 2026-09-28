import type { LogoutResponse } from "@royal-palace/contracts";
import { type NextRequest, NextResponse } from "next/server";

import {
  authErrorResponse,
  callIdentityApi,
  clearAuthCookies,
  readSessionId,
  requestId,
  requireCsrf,
} from "@/lib/auth/bff";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireCsrf(request);
    const result = await callIdentityApi<LogoutResponse>(
      "/v1/internal/auth/session/logout",
      { sessionId: readSessionId(request) },
      requestId(request),
    );
    const response = NextResponse.json(result);
    clearAuthCookies(response);
    return response;
  } catch (error) {
    const response = authErrorResponse(error);
    clearAuthCookies(response);
    return response;
  }
}
