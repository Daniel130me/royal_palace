import type { BeginLoginResponse } from "@royal-palace/contracts";
import { type NextRequest, NextResponse } from "next/server";

import {
  authErrorResponse,
  callIdentityApi,
  readSessionId,
  requestId,
  setLoginTransactionCookie,
} from "@/lib/auth/bff";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
    const requestedAssurance = request.nextUrl.searchParams.get("assurance") ?? undefined;
    const reauthenticate = requestedAssurance !== undefined;
    const reauthenticateSessionId = reauthenticate ? readSessionId(request) : undefined;
    const result = await callIdentityApi<BeginLoginResponse>(
      "/v1/internal/auth/login/start",
      {
        ...(reauthenticateSessionId === undefined ? {} : { reauthenticateSessionId }),
        ...(requestedAssurance === undefined ? {} : { requestedAssurance }),
        returnTo,
      },
      requestId(request),
    );
    const response = NextResponse.redirect(result.authorizationUrl, 303);
    setLoginTransactionCookie(response, result.transactionId);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
