"use client";

import { OrganizationEarningsPage } from "@/features/shared/organization-finance-pages";
import { useNav } from "@/lib/nav";

export function PharmacySettlements() {
  return (
    <OrganizationEarningsPage
      organizationId={useNav().session?.profileId}
      title="Settlements"
      description="Currency-separated earnings, paid amounts, and available balances from verified pharmacy payments."
    />
  );
}
