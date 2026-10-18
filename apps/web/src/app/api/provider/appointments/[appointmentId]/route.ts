import type { NextRequest } from "next/server";

import { proxyProviderAppointment } from "@/lib/auth/scheduling-bff";

export function GET(request: NextRequest, context: { params: Promise<{ appointmentId: string }> }) {
  return context.params.then(({ appointmentId }) =>
    proxyProviderAppointment(request, appointmentId),
  );
}
