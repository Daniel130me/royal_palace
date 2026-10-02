import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const READ_PATHS = [
  /^$/,
  new RegExp(`^(?:patients|organizations|practitioners)/${UUID}$`, "i"),
  new RegExp(`^${UUID}/documents/${UUID}/download$`, "i"),
] as const;
const CREATE_PATHS = [/^(?:patients|organizations|practitioners)$/] as const;
const COMMAND_PATHS = [
  new RegExp(`^${UUID}/(?:submit|withdraw)$`, "i"),
  new RegExp(`^${UUID}/documents/upload-intents$`, "i"),
  new RegExp(`^${UUID}/documents/${UUID}/complete$`, "i"),
] as const;
const UPDATE_PATHS = [
  new RegExp(`^(?:patients|organizations|practitioners)/${UUID}$`, "i"),
] as const;

export function GET(request: NextRequest, route: RouteContext) {
  return proxyAllowed(request, route, "GET", READ_PATHS);
}

export function POST(request: NextRequest, route: RouteContext) {
  return proxyAllowed(request, route, "POST", [...CREATE_PATHS, ...COMMAND_PATHS]);
}

export function PATCH(request: NextRequest, route: RouteContext) {
  return proxyAllowed(request, route, "PATCH", UPDATE_PATHS);
}

interface RouteContext {
  params: Promise<{ segments?: string[] }>;
}

async function proxyAllowed(
  request: NextRequest,
  route: RouteContext,
  method: "GET" | "PATCH" | "POST",
  allowed: readonly RegExp[],
) {
  const { segments = [] } = await route.params;
  const relativePath = segments.join("/");
  if (!allowed.some((pattern) => pattern.test(relativePath))) {
    return Response.json(
      { error: "route_not_found", message: "Route was not found" },
      { status: 404 },
    );
  }
  const query = method === "GET" ? request.nextUrl.search : "";
  return proxyAuthenticatedApi(
    request,
    `/v1/applications${relativePath.length === 0 ? "" : `/${relativePath}`}${query}`,
    method,
  );
}
