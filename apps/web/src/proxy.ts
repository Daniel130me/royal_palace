import { loadWebConfig } from "@royal-palace/config/environment";
import {
  REQUEST_ID_HEADER,
  resolveRequestContext,
  TRACEPARENT_HEADER,
} from "@royal-palace/config/observability";
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
