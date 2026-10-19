"use client";

import { FlaskConical } from "lucide-react";

import { OrganizationDiscoveryList } from "@/features/shared/organization-discovery-list";

export function PublicLaboratories() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <OrganizationDiscoveryList
        accentClassName="bg-violet-50 text-xs font-semibold text-violet-700"
        description="Browse verified diagnostic laboratories by location and available test service."
        emptyDescription="Try another service, location, or search term."
        emptyTitle="No matching laboratories"
        icon={FlaskConical}
        organizationType="LABORATORY"
        searchPlaceholder="Search laboratory, location, or service…"
        title="Laboratories"
      />
    </div>
  );
}
