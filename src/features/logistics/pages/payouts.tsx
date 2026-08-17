"use client";

import { useNav } from "@/lib/nav";
import { PayoutsView } from "@/components/healthcare/payouts-view";

export function LogisticsPayouts() {
  const { session, sessionName } = useNav();
  return (
    <PayoutsView
      entityType="logistics"
      entityId={session?.profileId ?? null}
      entityName={sessionName}
      earningsDescription="deliveries"
    />
  );
}
