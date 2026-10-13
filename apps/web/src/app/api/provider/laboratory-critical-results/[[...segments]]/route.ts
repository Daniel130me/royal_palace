import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import {
  exactLaboratoryUuid,
  laboratoryBffNotFound,
  laboratoryResultListPath,
} from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length !== 0) return laboratoryBffNotFound();
    const path = laboratoryResultListPath(
      "/v1/provider/laboratory-critical-results",
      request.nextUrl,
      "critical",
    );
    return path === null ? laboratoryBffNotFound() : proxyAuthenticatedApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const criticalResultId = segments.length === 2 ? exactLaboratoryUuid(segments[0]) : null;
    return criticalResultId !== null &&
      ["acknowledgements", "resolutions"].includes(segments[1] ?? "")
      ? proxyAuthenticatedApi(
          request,
          `/v1/provider/laboratory-critical-results/${criticalResultId}/${segments[1]}`,
          "POST",
        )
      : laboratoryBffNotFound();
  });
}
