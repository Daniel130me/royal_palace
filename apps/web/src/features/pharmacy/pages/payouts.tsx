"use client";

import { useNav } from "@/lib/nav";
import { PayoutsView } from "@/components/healthcare/payouts-view";

export function PharmacyPayouts() {
  const { session, sessionName } = useNav();
  return (
    <PayoutsView
      entityType="pharmacy"
      entityId={session?.profileId ?? null}
      entityName={sessionName}
      earningsDescription="medicine orders"
    />
  );
}
