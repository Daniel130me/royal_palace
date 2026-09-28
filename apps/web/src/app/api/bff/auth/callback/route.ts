import type { CompleteLoginResponse } from "@royal-palace/contracts";
import { type NextRequest, NextResponse } from "next/server";

import {
  authErrorResponse,
  callIdentityApi,
  clearLoginTransactionCookie,
  readLoginTransactionId,
  requestId,
  setAuthenticatedCookies,
  webOrigin,
} from "@/lib/auth/bff";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const result = await callIdentityApi<CompleteLoginResponse>(
      "/v1/internal/auth/login/callback",
      {
        currentUrl: request.url,
        transactionId: readLoginTransactionId(request),
      },
      requestId(request),
    );
    const response = NextResponse.redirect(new URL(result.returnTo, webOrigin()), 303);
    setAuthenticatedCookies(response, result.sessionId, result.csrfToken);
    clearLoginTransactionCookie(response);
    return response;
  } catch (error) {
    const response = authErrorResponse(error);
    clearLoginTransactionCookie(response);
    return response;
  }
}
