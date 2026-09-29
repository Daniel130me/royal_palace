"use client";

import { Pill } from "lucide-react";

import { OrganizationDiscoveryList } from "../components/organization-discovery-list";

export function PatientPharmacies() {
  return (
    <OrganizationDiscoveryList
      accentClassName="bg-amber-50 text-xs font-semibold text-amber-700"
      description="Browse verified pharmacies by location and available service."
      emptyDescription="Try another service, state, or search term."
      emptyTitle="No matching pharmacies"
      icon={Pill}
      organizationType="PHARMACY"
      searchPlaceholder="Search pharmacy, location, or service…"
      title="Find a pharmacy"
    />
  );
}
