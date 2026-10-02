import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const DETAIL = new RegExp(`^${UUID}$`, "i");
const DOCUMENT_DOWNLOAD = new RegExp(`^${UUID}/documents/${UUID}/download$`, "i");
const DECISION = new RegExp(`^${UUID}/(?:approve|reject|request-information)$`, "i");

export async function GET(request: NextRequest, route: RouteContext) {
  const path = await relativePath(route);
  if (path !== "" && !DETAIL.test(path) && !DOCUMENT_DOWNLOAD.test(path)) return notFound();
  return proxyAuthenticatedApi(request, upstream(path, request.nextUrl.search), "GET");
}

export async function POST(request: NextRequest, route: RouteContext) {
  const path = await relativePath(route);
  if (!DECISION.test(path)) return notFound();
  return proxyAuthenticatedApi(request, upstream(path), "POST");
}

interface RouteContext {
  params: Promise<{ segments?: string[] }>;
}

async function relativePath(route: RouteContext): Promise<string> {
  return (await route.params).segments?.join("/") ?? "";
}

function upstream(path: string, query = ""): string {
  return `/v1/admin/applications${path === "" ? "" : `/${path}`}${query}`;
}

function notFound(): Response {
  return Response.json(
    { error: "route_not_found", message: "Route was not found" },
    { status: 404 },
  );
}
