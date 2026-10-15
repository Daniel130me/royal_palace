import { type NextRequest, NextResponse } from "next/server";

import { proxyAuthenticatedApi, proxyAuthenticatedOrganizationApi } from "@/lib/auth/bff";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) =>
    segments.length === 0
      ? proxyAuthenticatedOrganizationApi(request, "/v1/organization/team", "GET")
      : notFound(),
  );
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length === 1 && segments[0] === "invitations") {
      return proxyAuthenticatedOrganizationApi(
        request,
        "/v1/organization/team/invitations",
        "POST",
      );
    }
    if (segments.length === 2 && segments[0] === "invitations" && segments[1] === "accept") {
      return proxyAuthenticatedApi(request, "/v1/organization/team/invitations/accept", "POST");
    }
    return notFound();
  });
}

export function DELETE(
  request: NextRequest,
  context: { params: Promise<{ segments?: string[] }> },
) {
  return context.params.then(({ segments = [] }) => {
    const resourceId = segments[1];
    if (
      segments.length !== 2 ||
      resourceId === undefined ||
      !UUID_PATTERN.test(resourceId) ||
      !["invitations", "members"].includes(segments[0] ?? "")
    ) {
      return notFound();
    }
    return proxyAuthenticatedOrganizationApi(
      request,
      `/v1/organization/team/${segments[0]}/${resourceId}`,
      "DELETE",
    );
  });
}

function notFound() {
  return NextResponse.json({ error: "not_found", message: "Route not found" }, { status: 404 });
}
