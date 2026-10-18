"use client";

import { OrganizationPayoutsPage } from "@/features/shared/organization-finance-pages";
import { useNav } from "@/lib/nav";

export function PharmacyPayouts() {
  return (
    <OrganizationPayoutsPage
      organizationId={useNav().session?.profileId}
      organizationLabel="pharmacy"
    />
  );
}
