"use client";

import { FlaskConical } from "lucide-react";

import { OrganizationDiscoveryList } from "../components/organization-discovery-list";

export function PatientLaboratories() {
  return (
    <OrganizationDiscoveryList
      accentClassName="bg-violet-50 text-xs font-semibold text-violet-700"
      description="Browse verified diagnostic laboratories by location and available test service."
      emptyDescription="Try another service, state, or search term."
      emptyTitle="No matching laboratories"
      icon={FlaskConical}
      organizationType="LABORATORY"
      searchPlaceholder="Search laboratory, location, or service…"
      title="Find a laboratory"
    />
  );
}
