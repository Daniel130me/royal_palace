"use client";

import { OrganizationEarningsPage } from "@/features/shared/organization-finance-pages";
import { useNav } from "@/lib/nav";

export function PharmacyCommissions() {
  return (
    <OrganizationEarningsPage
      organizationId={useNav().session?.profileId}
      title="Earnings"
      description="Verified pharmacy earnings by currency and settlement period. This replaces the prototype's ambiguous commission terminology."
    />
  );
}
