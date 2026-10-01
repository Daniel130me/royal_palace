"use client";

import { UserCircle } from "lucide-react";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";

import { ManagerStatusBadge } from "../components/manager-shared";
import { useManagerContext } from "../use-manager-context";

export function ManagerProfile() {
  const { error, loading, profile, refresh } = useManagerContext();
  if (loading) return <LoadingState label="Loading your manager profile…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (profile === null) return null;
  return (
    <div>
      <PageHeader
        description="This role distributes referral links and follows privacy-limited status, earnings, and support. It does not manage patient or organization records."
        title="Profile"
      />
      <SectionCard
        description="Application-owned manager identity"
        icon={UserCircle}
        title="Manager identity"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold">{profile.displayName}</p>
            <p className="font-mono text-xs text-muted-foreground">{profile.id}</p>
          </div>
          <ManagerStatusBadge status={profile.status} />
        </div>
      </SectionCard>
    </div>
  );
}
