import { type ApplicationEnvironment, loadWebConfig } from "@royal-palace/config/environment";
import {
  REQUEST_ID_HEADER,
  resolveRequestContext,
  TRACEPARENT_HEADER,
} from "@royal-palace/config/observability";
import { timingSafeStringEqual } from "@royal-palace/security";
import { type NextRequest, NextResponse } from "next/server";

const webConfig = loadWebConfig();
const PROTECTED_ENVIRONMENTS: ReadonlySet<ApplicationEnvironment> = new Set([
  "staging",
  "production",
]);
const ACTIVE_PRODUCTION_BFF_ROUTES = new Set([
  "/api/bff/auth/callback",
  "/api/bff/auth/login",
  "/api/bff/auth/logout",
  "/api/bff/auth/refresh",
  "/api/bff/auth/session",
  "/api/public/hospitals",
  "/api/public/laboratories",
  "/api/public/pharmacies",
  "/api/public/practitioners",
  "/api/public/professions",
  "/api/public/services",
  "/api/public/specialties",
]);
const UUID_PATH_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ACTIVE_DYNAMIC_BFF_ROUTES = [
  new RegExp(
    `^/api/applications(?:/(?:patients|organizations|practitioners)(?:/${UUID_PATH_SEGMENT})?|/${UUID_PATH_SEGMENT}/(?:submit|withdraw|documents/upload-intents))?$`,
    "i",
  ),
  new RegExp(
    `^/api/admin/applications(?:/${UUID_PATH_SEGMENT}(?:/(?:approve|reject|request-information))?)?$`,
    "i",
  ),
  new RegExp(`^/api/support/applications(?:/${UUID_PATH_SEGMENT}(?:/start-review)?)?$`, "i"),
  new RegExp(`^/api/admin/catalogue/(?:professions|specialties)(?:/${UUID_PATH_SEGMENT})?$`, "i"),
  /^\/api\/manager\/(?:profile|referral-links|referrals|earnings|tickets)$/i,
  new RegExp(`^/api/manager/tickets/${UUID_PATH_SEGMENT}(?:/follow-ups)?$`, "i"),
  /^\/api\/support\/manager-tickets$/i,
  new RegExp(`^/api/support/manager-tickets/${UUID_PATH_SEGMENT}$`, "i"),
  /^\/api\/admin\/managers$/i,
  new RegExp(
    `^/api/admin/managers/${UUID_PATH_SEGMENT}/(?:referral-links|commission-policies)$`,
    "i",
  ),
  new RegExp(`^/api/admin/managers/commission-policies/${UUID_PATH_SEGMENT}/activate$`, "i"),
  new RegExp(`^/api/admin/managers/attributions/${UUID_PATH_SEGMENT}/corrections$`, "i"),
  /^\/api\/public\/hospitals\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /^\/api\/public\/(?:laboratories|pharmacies)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /^\/api\/public\/practitioners\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
] as const;

export function proxy(request: NextRequest): NextResponse {
  const context = resolveRequestContext({
    [REQUEST_ID_HEADER]: request.headers.get(REQUEST_ID_HEADER) ?? undefined,
    [TRACEPARENT_HEADER]: request.headers.get(TRACEPARENT_HEADER) ?? undefined,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, context.requestId);
  requestHeaders.set(TRACEPARENT_HEADER, context.traceparent);

  if (!isApiRouteEnabled(webConfig.appEnvironment, request.nextUrl.pathname)) {
    const response = NextResponse.json(
      {
        error: "prototype_route_disabled",
        message: "This prototype route is not available in protected environments",
      },
      { status: 404 },
    );
    response.headers.set(REQUEST_ID_HEADER, context.requestId);
    response.headers.set(TRACEPARENT_HEADER, context.traceparent);
    console.warn(
      JSON.stringify({
        environment: webConfig.appEnvironment,
        level: "warn",
        message: "bff.prototype_route.denied",
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

export function isApiRouteEnabled(environment: ApplicationEnvironment, pathname: string): boolean {
  if (!pathname.startsWith("/api/") || !PROTECTED_ENVIRONMENTS.has(environment)) return true;
  return (
    ACTIVE_PRODUCTION_BFF_ROUTES.has(pathname) ||
    ACTIVE_DYNAMIC_BFF_ROUTES.some((pattern) => pattern.test(pathname))
  );
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
