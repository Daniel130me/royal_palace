"use client";

import { Pill } from "lucide-react";

import { OrganizationDiscoveryList } from "@/features/shared/organization-discovery-list";

export function PublicPharmacies() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <OrganizationDiscoveryList
        accentClassName="bg-amber-50 text-xs font-semibold text-amber-700"
        description="Browse verified pharmacies by location and available service."
        emptyDescription="Try another service, location, or search term."
        emptyTitle="No matching pharmacies"
        icon={Pill}
        organizationType="PHARMACY"
        searchPlaceholder="Search pharmacy, location, or service…"
        title="Pharmacies"
      />
    </div>
  );
}
