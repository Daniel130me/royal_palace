"use client";

// Profile page (plan §3.1): the signed-in manager's identity, employment and
// territory details plus headline stats. Strictly read-only — profile changes
// are handled by Royal Palace in this prototype.

import { useEffect, useState } from "react";
import { managerService, type ManagerMePayload } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState, SectionCard } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatDate } from "@/lib/format";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/manager-constants";
import {
  BadgeCheck, Building2, ClipboardList, Coins, Handshake, IdCard, LifeBuoy, Mail, MapPin, Phone, UserCircle,
} from "lucide-react";

export function ManagerProfile() {
  const [data, setData] = useState<ManagerMePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    managerService
      .me()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load your profile."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading your profile…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const m = data.manager;

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your identity, employment and territory details. This view is read-only."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <MetricCard label="Portfolio size" value={data.stats.portfolioCount} hint="Organizations you currently manage" icon={Building2} />
        <MetricCard label="Acquired by you" value={data.stats.acquiredCount} hint="Organizations you brought onto the platform" icon={Handshake} tone="violet" />
        <MetricCard label="Open tickets" value={data.stats.openTicketCount} hint="First-level support workload" icon={LifeBuoy} tone="warning" />
        <MetricCard label="Pending applications" value={data.stats.pendingApplications} hint="In review right now" icon={ClipboardList} tone="info" />
      </div>

      <SectionCard title="Manager identity" icon={UserCircle} description="Verified details held by Royal Palace">
        <div className="flex items-center gap-3 pb-4 border-b border-border/60">
          <div className="rounded-2xl bg-primary/10 p-3 shrink-0">
            <UserCircle className="h-8 w-8 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-lg leading-tight">{m.firstName} {m.lastName}</p>
              <ManagerStatusBadge status={m.verificationStatus} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              Royal Palace Manager · {EMPLOYMENT_STATUS_LABELS[m.employmentStatus] ?? m.employmentStatus}
            </p>
          </div>
        </div>

        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 pt-4 text-sm">
          <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Manager ID" value={m.managerNumber} mono />
          <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Onboarding code" value={m.onboardingCode} mono />
          <Field icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={m.email} />
          <Field icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={m.phone} />
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label="City / State" value={`${m.city}, ${m.state}`} />
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Territory" value={m.territory} />
          <Field
            icon={<Coins className="h-3.5 w-3.5" />}
            label="Employment status"
            value={EMPLOYMENT_STATUS_LABELS[m.employmentStatus] ?? m.employmentStatus}
          />
          <Field icon={<Building2 className="h-3.5 w-3.5" />} label="Joined" value={formatDate(m.joinedAt)} />
        </dl>
      </SectionCard>

      <p className="mt-4 text-xs text-muted-foreground">
        Need a change to your details? Contact Royal Palace — profile, territory and employment records are maintained by the admin team.
      </p>
    </div>
  );
}

function Field({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2.5 sm:border-0 sm:pb-0">
      <dt className="text-muted-foreground flex items-center gap-1.5 shrink-0">{icon}{label}</dt>
      <dd className={`font-medium text-right min-w-0 truncate ${mono ? "font-mono text-xs pt-0.5" : ""}`}>{value}</dd>
    </div>
  );
}
