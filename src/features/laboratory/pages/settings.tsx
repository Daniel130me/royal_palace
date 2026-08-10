"use client";

import { useLabContext } from "../use-lab-context";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, Mail, MapPin, Star, Shield, CheckCircle2, Globe, FileText } from "lucide-react";

export function LabSettings() {
  const { lab, loading, error, reload } = useLabContext();

  if (loading) return <LoadingState label="Loading laboratory profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  const verified = lab.verificationStatus === "approved";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory profile"
        description="Your laboratory's verified profile on Royal Palace."
      />

      {/* Identity hero */}
      <div className={verified ? "rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4" : "rounded-2xl border border-amber-200 bg-amber-50/40 p-4"}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-lg leading-tight truncate">{lab.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{lab.laboratoryNumber}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {lab.city}, {lab.state}</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {lab.rating.toFixed(1)}</span>
            </div>
          </div>
          <div className={verified ? "rounded-xl bg-emerald-100 p-2 shrink-0" : "rounded-xl bg-amber-100 p-2 shrink-0"}>
            {verified
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              : <Shield className="h-5 w-5 text-amber-600" />}
          </div>
        </div>
      </div>

      {/* Expandable sections */}
      <div className="space-y-2">
        <ExpandableCard
          defaultOpen
          leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><Phone className="h-4 w-4 text-sky-600" /></div>}
          title="Contact details"
          subtitle={`${lab.phone} · ${lab.email}`}
        >
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Phone} label="Phone" value={lab.phone} />
            <InfoRow icon={Mail} label="Email" value={lab.email} />
            <InfoRow icon={Globe} label="City" value={lab.city} />
            <InfoRow icon={Globe} label="State" value={lab.state} />
          </div>
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</p>
            <p className="text-sm leading-relaxed">{lab.address}</p>
          </div>
        </ExpandableCard>

        <ExpandableCard
          leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><Shield className="h-4 w-4 text-emerald-600" /></div>}
          title="Verification"
          subtitle={`Status: ${lab.verificationStatus}`}
          trailing={<Badge variant="outline" className="capitalize">{lab.verificationStatus}</Badge>}
        >
          <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>
              Your laboratory is verified on the Royal Palace platform. Update contact details by contacting your account manager.
            </p>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700">
                Verified laboratories can publish results and receive settlement payouts.
              </p>
            </div>
          </div>
        </ExpandableCard>

        <ExpandableCard
          leading={<div className="rounded-lg bg-primary/10 p-2"><FileText className="h-4 w-4 text-primary" /></div>}
          title="Profile settings"
          subtitle="Notification preferences, billing, team members"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is a prototype laboratory account. Settings such as notification preferences, billing details, and team members will be available in the production release.
          </p>
        </ExpandableCard>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
