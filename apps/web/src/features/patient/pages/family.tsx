"use client";

import { GovernedCapabilityPending } from "@/features/shared/governed-capability-pending";

export function PatientFamily() {
  return (
    <GovernedCapabilityPending
      title="Family"
      description="Manage healthcare for yourself and authorised dependants."
      decisions={[
        "Approve guardian authority, age-of-majority, custody, delegation, and revocation rules per jurisdiction.",
        "Approve identity verification and duplicate-patient resolution for dependants.",
        "Approve what clinical, payment, notification, and privacy data a guardian may access.",
      ]}
    />
  );
}
