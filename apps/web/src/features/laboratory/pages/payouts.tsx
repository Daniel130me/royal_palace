"use client";

import { useNav } from "@/lib/nav";
import { PayoutsView } from "@/components/healthcare/payouts-view";

export function LaboratoryPayouts() {
  const { session, sessionName } = useNav();
  return (
    <PayoutsView
      entityType="laboratory"
      entityId={session?.profileId ?? null}
      entityName={sessionName}
      earningsDescription="laboratory bookings"
    />
  );
}
