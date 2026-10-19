"use client";

import { GovernedCapabilityPending } from "@/features/shared/governed-capability-pending";

export function AdminPharmacyCommissions() {
  return (
    <GovernedCapabilityPending
      title="Pharmacy Commissions"
      description="Configure effective-dated pharmacy commercial policy."
      decisions={[
        "Approve the eligible transaction base, exclusions, refunds, disputes, and tax treatment.",
        "Approve effective dating, versioning, reviewer separation, and retroactive-change rules.",
        "Qualify payment and payout providers for the first production region.",
      ]}
    />
  );
}
