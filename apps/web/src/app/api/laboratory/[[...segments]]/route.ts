import type { NextRequest } from "next/server";

import { proxyAuthenticatedOrganizationApi } from "@/lib/auth/bff";
import {
  exactLaboratoryUuid,
  laboratoryBffNotFound,
  laboratoryQueuePath,
} from "@/lib/auth/laboratory-bff";

export function GET(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const bookingId = segments.length === 2 ? exactLaboratoryUuid(segments[1]) : null;
    const path =
      segments.length === 1 && segments[0] === "bookings"
        ? laboratoryQueuePath(request.nextUrl)
        : segments[0] === "bookings" && bookingId !== null
          ? `/v1/laboratory/bookings/${bookingId}`
          : null;
    return path === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedOrganizationApi(request, path, "GET");
  });
}

export function POST(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  return context.params.then(({ segments = [] }) => {
    const bookingId = segments.length === 3 ? exactLaboratoryUuid(segments[1]) : null;
    return segments[0] === "bookings" && bookingId !== null && segments[2] === "transitions"
      ? proxyAuthenticatedOrganizationApi(
          request,
          `/v1/laboratory/bookings/${bookingId}/transitions`,
          "POST",
        )
      : laboratoryBffNotFound();
  });
}
