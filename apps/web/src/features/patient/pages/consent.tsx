"use client";

import { GovernedCapabilityPending } from "@/features/shared/governed-capability-pending";

export function PatientConsent() {
  return (
    <GovernedCapabilityPending
      title="Record Access"
      description="Review and control access to your health information."
      decisions={[
        "Approve the consent purposes, record categories, recipients, expiry, and withdrawal effects.",
        "Approve emergency-access, legal-hold, retention, and historical-copy rules.",
        "Complete clinical, privacy, and legal review for the first launch jurisdiction.",
      ]}
    />
  );
}
