import { loadWebConfig } from "@royal-palace/config/environment";
import {
  REQUEST_ID_HEADER,
  resolveRequestContext,
  TRACEPARENT_HEADER,
} from "@royal-palace/config/observability";
import { timingSafeStringEqual } from "@royal-palace/security";
import { type NextRequest, NextResponse } from "next/server";

const webConfig = loadWebConfig();

export function proxy(request: NextRequest): NextResponse {
  const context = resolveRequestContext({
    [REQUEST_ID_HEADER]: request.headers.get(REQUEST_ID_HEADER) ?? undefined,
    [TRACEPARENT_HEADER]: request.headers.get(TRACEPARENT_HEADER) ?? undefined,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, context.requestId);
  requestHeaders.set(TRACEPARENT_HEADER, context.traceparent);

  if (requiresCsrfProtection(request)) {
    const csrfCookieName =
      new URL(webConfig.webOrigin).protocol === "https:" ? "__Host-csrf" : "rp-dev-csrf";
    const csrfCookie = request.cookies.get(csrfCookieName)?.value;
    const csrfHeader = request.headers.get("x-rp-csrf-token");
    if (
      request.headers.get("origin") !== webConfig.webOrigin ||
      csrfCookie === undefined ||
      csrfHeader === null ||
      !timingSafeStringEqual(csrfCookie, csrfHeader)
    ) {
      return NextResponse.json(
        { error: "invalid_csrf_token", message: "CSRF validation failed" },
        { status: 403 },
      );
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, context.requestId);
  response.headers.set(TRACEPARENT_HEADER, context.traceparent);

  // Log only routing metadata. Query values, request headers, cookies, and bodies are deliberately excluded.
  console.info(
    JSON.stringify({
      environment: webConfig.appEnvironment,
      level: "info",
      message: "bff.request.received",
      method: request.method,
      path: request.nextUrl.pathname,
      requestId: context.requestId,
      service: "web",
      time: new Date().toISOString(),
      traceId: context.traceId,
      version: webConfig.appVersion,
    }),
  );

  return response;
}

function requiresCsrfProtection(request: NextRequest): boolean {
  return (
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
