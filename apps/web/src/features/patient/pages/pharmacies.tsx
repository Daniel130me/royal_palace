"use client";

import { Pill } from "lucide-react";

import { OrganizationDiscoveryList } from "@/features/shared/organization-discovery-list";
import { formatPublicLocation } from "@/lib/public-location";
import { navigate } from "@/lib/nav";

export function PatientPharmacies() {
  return (
    <OrganizationDiscoveryList
      accentClassName="bg-amber-50 text-xs font-semibold text-amber-700"
      description="Browse verified pharmacies by location and available service."
      emptyDescription="Try another service, state, or search term."
      emptyTitle="No matching pharmacies"
      icon={Pill}
      organizationType="PHARMACY"
      onSelect={(organization) => {
        const location = organization.locations[0];
        navigate("patient", "pharmacy", {
          id: organization.id,
          location: location === undefined ? "" : formatPublicLocation(location),
          name: organization.displayName,
        });
      }}
      searchPlaceholder="Search pharmacy, location, or service…"
      title="Find a pharmacy"
    />
  );
}
