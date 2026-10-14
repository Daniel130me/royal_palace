import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import { exactLaboratoryUuid, laboratoryBffNotFound } from "@/lib/auth/laboratory-bff";

export function POST(request: NextRequest, context: { params: Promise<{ bookingId: string }> }) {
  return context.params.then(({ bookingId }) => {
    const exactBookingId = exactLaboratoryUuid(bookingId);
    return exactBookingId === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedApi(
          request,
          `/v1/patient/laboratory-bookings/${exactBookingId}/reviews`,
          "POST",
        );
  });
}
