import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const COLLECTION = /^(?:professions|specialties)$/;
const ENTRY = new RegExp(`^(?:professions|specialties)/${UUID}$`, "i");

export async function GET(request: NextRequest, route: RouteContext) {
  const path = await relativePath(route);
  if (!COLLECTION.test(path)) return notFound();
  return proxyAuthenticatedApi(request, upstream(path, request.nextUrl.search), "GET");
}

export async function POST(request: NextRequest, route: RouteContext) {
  const path = await relativePath(route);
  if (!COLLECTION.test(path)) return notFound();
  return proxyAuthenticatedApi(request, upstream(path), "POST");
}

export async function PATCH(request: NextRequest, route: RouteContext) {
  const path = await relativePath(route);
  if (!ENTRY.test(path)) return notFound();
  return proxyAuthenticatedApi(request, upstream(path), "PATCH");
}

interface RouteContext {
  params: Promise<{ segments?: string[] }>;
}

async function relativePath(route: RouteContext): Promise<string> {
  return (await route.params).segments?.join("/") ?? "";
}

function upstream(path: string, query = ""): string {
  return `/v1/admin/catalogue/${path}${query}`;
}

function notFound(): Response {
  return Response.json(
    { error: "route_not_found", message: "Route was not found" },
    { status: 404 },
  );
}
