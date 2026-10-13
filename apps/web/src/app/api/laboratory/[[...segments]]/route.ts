import type { NextRequest } from "next/server";

import { proxyAuthenticatedOrganizationApi } from "@/lib/auth/bff";
import {
  exactLaboratoryUuid,
  laboratoryBffNotFound,
  laboratoryQueuePath,
  laboratoryResultListPath,
} from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const bookingId = segments.length === 2 ? exactLaboratoryUuid(segments[1]) : null;
    const resultId = segments[0] === "results" ? exactLaboratoryUuid(segments[1]) : null;
    const attachmentId = exactLaboratoryUuid(segments[3]);
    const path =
      segments.length === 1 && segments[0] === "bookings"
        ? laboratoryQueuePath(request.nextUrl)
        : segments[0] === "bookings" && bookingId !== null
          ? `/v1/laboratory/bookings/${bookingId}`
          : segments.length === 1 && segments[0] === "results"
            ? laboratoryResultListPath("/v1/laboratory/results", request.nextUrl, "result")
            : segments[0] === "results" && bookingId !== null
              ? `/v1/laboratory/results/${bookingId}`
              : resultId !== null &&
                  segments[2] === "attachments" &&
                  attachmentId !== null &&
                  segments[4] === "download" &&
                  segments.length === 5
                ? `/v1/laboratory/results/${resultId}/attachments/${attachmentId}/download`
                : null;
    return path === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedOrganizationApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const bookingId = segments.length === 3 ? exactLaboratoryUuid(segments[1]) : null;
    const resultId = segments.length >= 2 ? exactLaboratoryUuid(segments[1]) : null;
    if (segments.length === 1 && segments[0] === "results") {
      return proxyAuthenticatedOrganizationApi(request, "/v1/laboratory/results", "POST");
    }
    if (resultId !== null && segments.length === 3 && segments[2] === "attachment-upload-intents") {
      return proxyAuthenticatedOrganizationApi(
        request,
        `/v1/laboratory/results/${resultId}/attachment-upload-intents`,
        "POST",
      );
    }
    const attachmentId = exactLaboratoryUuid(segments[3]);
    if (
      resultId !== null &&
      attachmentId !== null &&
      segments.length === 5 &&
      segments[2] === "attachments" &&
      segments[4] === "complete"
    ) {
      return proxyAuthenticatedOrganizationApi(
        request,
        `/v1/laboratory/results/${resultId}/attachments/${attachmentId}/complete`,
        "POST",
      );
    }
    return segments[0] === "bookings" && bookingId !== null && segments[2] === "transitions"
      ? proxyAuthenticatedOrganizationApi(
          request,
          `/v1/laboratory/bookings/${bookingId}/transitions`,
          "POST",
        )
      : segments[0] === "results" &&
          resultId !== null &&
          segments.length === 3 &&
          ["review-transitions", "publications", "amendments"].includes(segments[2] ?? "")
        ? proxyAuthenticatedOrganizationApi(
            request,
            `/v1/laboratory/results/${resultId}/${segments[2]}`,
            "POST",
          )
        : laboratoryBffNotFound();
  });
}

export function PATCH(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const resultId = segments.length === 3 ? exactLaboratoryUuid(segments[1]) : null;
    return segments[0] === "results" && resultId !== null && segments[2] === "draft"
      ? proxyAuthenticatedOrganizationApi(
          request,
          `/v1/laboratory/results/${resultId}/draft`,
          "PATCH",
        )
      : laboratoryBffNotFound();
  });
}
