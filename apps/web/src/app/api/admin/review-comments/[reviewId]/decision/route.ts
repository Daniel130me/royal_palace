import type { NextRequest } from "next/server";

import { proxyAuthenticatedApi } from "@/lib/auth/bff";
import { exactLaboratoryUuid, laboratoryBffNotFound } from "@/lib/auth/laboratory-bff";

export function POST(request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  return context.params.then(({ reviewId }) => {
    const exactReviewId = exactLaboratoryUuid(reviewId);
    return exactReviewId === null
      ? laboratoryBffNotFound()
      : proxyAuthenticatedApi(
          request,
          `/v1/admin/review-comments/${exactReviewId}/decision`,
          "POST",
        );
  });
}
