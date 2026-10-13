import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import {
  exactLaboratoryUuid,
  laboratoryBffNotFound,
  laboratoryResultListPath,
} from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    if (segments.length === 0) {
      const path = laboratoryResultListPath(
        "/v1/patient/laboratory-results",
        request.nextUrl,
        "published",
      );
      return path === null ? laboratoryBffNotFound() : proxyAuthenticatedApi(request, path, "GET");
    }
    const resultId = segments.length === 1 ? exactLaboratoryUuid(segments[0]) : null;
    const attachmentResultId = segments.length === 4 ? exactLaboratoryUuid(segments[0]) : null;
    const attachmentId = segments.length === 4 ? exactLaboratoryUuid(segments[2]) : null;
    if (
      attachmentResultId !== null &&
      attachmentId !== null &&
      segments[1] === "attachments" &&
      segments[3] === "download"
    ) {
      return proxyAuthenticatedApi(
        request,
        `/v1/patient/laboratory-results/${attachmentResultId}/attachments/${attachmentId}/download`,
        "GET",
      );
    }
    return resultId === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedApi(request, `/v1/patient/laboratory-results/${resultId}`, "GET");
  });
}
