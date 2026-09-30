"use client";

import { AppShell } from "@/components/healthcare/app-shell";
import { ApplicationReviewPage } from "@/features/shared/application-review-page";
import { ClipboardList } from "lucide-react";

export function SupportPortal() {
  return (
    <AppShell
      portal="support"
      brand="Royal Palace Support"
      navItems={[{ label: "Applications", page: "dashboard", icon: ClipboardList }]}
    >
      <ApplicationReviewPage authority="SUPPORT" />
    </AppShell>
  );
}
