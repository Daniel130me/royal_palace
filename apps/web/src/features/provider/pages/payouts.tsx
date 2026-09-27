"use client";

import { useNav } from "@/lib/nav";
import { PayoutsView } from "@/components/healthcare/payouts-view";

export function ProviderPayouts() {
  const { session, sessionName } = useNav();
  return (
    <PayoutsView
      entityType="provider"
      entityId={session?.profileId ?? null}
      entityName={sessionName}
      earningsDescription="consultations"
    />
  );
}
