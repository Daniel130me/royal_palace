import { randomUUID } from "node:crypto";

import { loadWebConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import {
  createInternalRequestHeaders,
  KeyRingSecretBox,
  timingSafeStringEqual,
} from "@royal-palace/security";
import { type NextRequest, NextResponse } from "next/server";

const config = loadWebConfig();
const cookieSecrets = new KeyRingSecretBox(
  config.bffCookieEncryptionKeys,
  config.bffActiveCookieKeyId,
);
const secureCookies = new URL(config.webOrigin).protocol === "https:";
const cookiePrefix = secureCookies ? "__Host-" : "rp-dev-";

export const SESSION_COOKIE = `${cookiePrefix}session`;
export const LOGIN_TRANSACTION_COOKIE = `${cookiePrefix}login`;
export const CSRF_COOKIE = `${cookiePrefix}csrf`;
export const CSRF_HEADER = "x-rp-csrf-token";

const SESSION_COOKIE_CONTEXT = "bff-session-cookie";
const LOGIN_COOKIE_CONTEXT = "bff-login-cookie";

export class BffAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BffAuthError";
  }
}

export async function callIdentityApi<T>(
  path: string,
  payload: Readonly<Record<string, unknown>>,
  requestId: string = randomUUID(),
): Promise<T> {
  const body = JSON.stringify(payload);
  const signatureHeaders = createInternalRequestHeaders(
    { body, method: "POST", path, requestId },
    config.bffInternalSecret,
  );
  let response: Response;
  try {
    response = await fetch(new URL(path, config.apiBaseUrl), {
      body,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        ...signatureHeaders,
      },
      method: "POST",
      signal: AbortSignal.timeout(config.bffApiTimeoutMs),
    });
  } catch {
    throw new BffAuthError("Identity service is unavailable", 503, "identity_service_unavailable");
  }

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = asErrorResponse(result);
    throw new BffAuthError(error.message, response.status, error.code);
  }
  return result as T;
}

export async function callAuthenticatedApi<T>(
  request: NextRequest,
  apiPath: string,
  options: { body?: unknown; idempotencyKey?: string; method?: "GET" | "PATCH" | "POST" } = {},
): Promise<T> {
  const sessionReference = readSessionId(request);
  const method = options.method ?? "GET";
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  const id = requestId(request);
  const traceparent = request.headers.get("traceparent");
  const upstreamUrl = new URL(apiPath, config.apiBaseUrl);
  const signatureHeaders = createInternalRequestHeaders(
    {
      body,
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      method,
      path: upstreamUrl.pathname,
      requestId: id,
      sessionReference,
    },
    config.bffInternalSecret,
  );
  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      body: body.length === 0 ? undefined : body,
      cache: "no-store",
      headers: {
        ...(body.length === 0 ? {} : { "content-type": "application/json" }),
        ...(options.idempotencyKey === undefined
          ? {}
          : { "idempotency-key": options.idempotencyKey }),
        ...(traceparent === null ? {} : { traceparent }),
        "x-request-id": id,
        ...signatureHeaders,
      },
      method,
      signal: AbortSignal.timeout(config.bffApiTimeoutMs),
    });
  } catch {
    throw new BffAuthError("Application service is unavailable", 503, "service_unavailable");
  }

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = asErrorResponse(result);
    throw new BffAuthError(error.message, response.status, error.code);
  }
  return result as T;
}

/**
 * Shared protected-route adapter. Mutations are checked again at the route boundary
 * even though the application proxy also rejects cross-site requests.
 */
export async function proxyAuthenticatedApi(
  request: NextRequest,
  apiPath: string,
  method: "GET" | "PATCH" | "POST",
): Promise<NextResponse> {
  try {
    if (method !== "GET") requireCsrf(request);
    const body = method === "GET" ? undefined : await request.json().catch(() => null);
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const result = await callAuthenticatedApi<unknown>(request, apiPath, {
      body,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      method,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status === 401) clearAuthCookies(response);
    return response;
  }
}

export function readSessionId(request: NextRequest): string {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  if (value === undefined) throw new BffAuthError("Session is required", 401, "missing_session");
  try {
    return cookieSecrets.open(value, SESSION_COOKIE_CONTEXT);
  } catch {
    throw new BffAuthError("Session is invalid", 401, "invalid_session_cookie");
  }
}

export async function getAuthenticatedSession(request: Request): Promise<CurrentSession> {
  const value = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (value === undefined) throw new BffAuthError("Session is required", 401, "missing_session");
  let sessionId: string;
  try {
    sessionId = cookieSecrets.open(value, SESSION_COOKIE_CONTEXT);
  } catch {
    throw new BffAuthError("Session is invalid", 401, "invalid_session_cookie");
  }
  return callIdentityApi<CurrentSession>("/v1/internal/auth/session/current", { sessionId });
}

export function readLoginTransactionId(request: NextRequest): string {
  const value = request.cookies.get(LOGIN_TRANSACTION_COOKIE)?.value;
  if (value === undefined) {
    throw new BffAuthError("Login transaction is required", 401, "missing_login_transaction");
  }
  try {
    return cookieSecrets.open(value, LOGIN_COOKIE_CONTEXT);
  } catch {
    throw new BffAuthError("Login transaction is invalid", 401, "invalid_login_transaction_cookie");
  }
}

export function setLoginTransactionCookie(response: NextResponse, transactionId: string): void {
  response.cookies.set(
    LOGIN_TRANSACTION_COOKIE,
    cookieSecrets.seal(transactionId, LOGIN_COOKIE_CONTEXT),
    {
      ...baseCookieOptions(true),
      maxAge: 600,
    },
  );
}

export function setAuthenticatedCookies(
  response: NextResponse,
  sessionId: string,
  csrfToken: string,
): void {
  response.cookies.set(SESSION_COOKIE, cookieSecrets.seal(sessionId, SESSION_COOKIE_CONTEXT), {
    ...baseCookieOptions(true),
  });
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    ...baseCookieOptions(false),
  });
}

export function clearAuthCookies(response: NextResponse): void {
  for (const name of [SESSION_COOKIE, LOGIN_TRANSACTION_COOKIE, CSRF_COOKIE]) {
    response.cookies.set(name, "", { ...baseCookieOptions(name !== CSRF_COOKIE), maxAge: 0 });
  }
}

export function clearLoginTransactionCookie(response: NextResponse): void {
  response.cookies.set(LOGIN_TRANSACTION_COOKIE, "", { ...baseCookieOptions(true), maxAge: 0 });
}

export function requireCsrf(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (origin !== config.webOrigin) {
    throw new BffAuthError("Request origin is not allowed", 403, "invalid_origin");
  }
  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  if (
    headerToken === null ||
    cookieToken === undefined ||
    !timingSafeStringEqual(headerToken, cookieToken)
  ) {
    throw new BffAuthError("CSRF validation failed", 403, "invalid_csrf_token");
  }
}

export function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? randomUUID();
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof BffAuthError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "upstream_request_failed", message: "Upstream request failed" },
    { status: 500 },
  );
}

export function webOrigin(): string {
  return config.webOrigin;
}

function baseCookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    path: "/",
    priority: "high" as const,
    sameSite: "lax" as const,
    secure: secureCookies,
  };
}

function asErrorResponse(value: unknown): { code: string; message: string } {
  if (typeof value === "object" && value !== null) {
    const error = "error" in value && typeof value.error === "string" ? value.error : null;
    const message = "message" in value && typeof value.message === "string" ? value.message : null;
    if (error !== null && message !== null) return { code: error, message };
  }
  return { code: "upstream_request_failed", message: "Upstream request failed" };
}

function readCookie(header: string | null, expectedName: string): string | undefined {
  if (header === null) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name === expectedName) {
      try {
        return decodeURIComponent(pair.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
