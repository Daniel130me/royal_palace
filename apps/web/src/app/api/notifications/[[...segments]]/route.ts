import type { NextRequest } from "next/server";

import { authErrorResponse, BffAuthError, proxyAuthenticatedApi } from "@/lib/auth/bff";
import { exactUuid } from "@/lib/auth/pharmacy-bff";

type Context = { params: Promise<{ segments?: string[] }> };

export function GET(request: NextRequest, context: Context) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length === 0) {
      try {
        return proxyAuthenticatedApi(request, notificationListPath(request.nextUrl), "GET");
      } catch (error) {
        return authErrorResponse(error);
      }
    }
    return segments.length === 1 && segments[0] === "preferences"
      ? proxyAuthenticatedApi(request, "/v1/notifications/preferences", "GET")
      : notFound();
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === "read-all") {
    return proxyAuthenticatedApi(request, "/v1/notifications/read-all", "POST");
  }
  const itemId = exactUuid(segments[0]);
  return segments.length === 2 && itemId !== null && segments[1] === "read"
    ? proxyAuthenticatedApi(request, `/v1/notifications/${itemId}/read`, "POST")
    : notFound();
}

export async function PATCH(request: NextRequest, context: Context) {
  const { segments = [] } = await context.params;
  return segments.length === 3 &&
    segments[0] === "preferences" &&
    segments[1] === "email" &&
    segments[2] === "marketing"
    ? proxyAuthenticatedApi(
        request,
        "/v1/notifications/preferences/email/marketing",
        "PATCH",
      )
    : notFound();
}

function notificationListPath(url: URL): string {
  const output = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (name === "cursor") {
      if (value.length < 1 || value.length > 1024) invalidQuery();
    } else if (name === "limit") {
      if (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 50) invalidQuery();
    } else if (name === "unreadOnly") {
      if (!["true", "false"].includes(value)) invalidQuery();
    } else {
      invalidQuery();
    }
    output.append(name, value);
  }
  const query = output.toString();
  return query.length === 0 ? "/v1/notifications" : `/v1/notifications?${query}`;
}

function invalidQuery(): never {
  throw new BffAuthError("Notification query is invalid", 400, "invalid_request");
}

function notFound() {
  return Response.json(
    { error: "route_not_found", message: "The requested notification operation is not available" },
    { status: 404 },
  );
}
