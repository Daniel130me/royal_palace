"use client";

import { PractitionerDirectory } from "@/features/shared/practitioner-directory";

export function PublicProviders() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PractitionerDirectory context="public" />
    </div>
  );
}
