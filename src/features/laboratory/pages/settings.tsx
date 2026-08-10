"use client";

import { useLabContext } from "../use-lab-context";
import { PageHeader, SectionCard, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, Mail, MapPin, Star, Shield, CheckCircle2 } from "lucide-react";

export function LabSettings() {
  const { lab, loading, error, reload } = useLabContext();

  if (loading) return <LoadingState label="Loading laboratory profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  const verified = lab.verificationStatus === "approved";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratory profile"
        description="Your laboratory's verified profile on Royal Palace."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Laboratory" icon={Building2}>
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-primary/10 p-3 shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-lg leading-tight">{lab.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{lab.laboratoryNumber}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoRow label="Laboratory number" value={lab.laboratoryNumber} />
              <InfoRow label="Verification status" value={lab.verificationStatus} />
              <InfoRow label="Phone" value={lab.phone} icon={Phone} />
              <InfoRow label="Email" value={lab.email} icon={Mail} />
              <InfoRow label="City" value={lab.city} icon={MapPin} />
              <InfoRow label="State" value={lab.state} icon={MapPin} />
              <InfoRow label="Rating" value={`${lab.rating.toFixed(1)} ★`} icon={Star} />
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</p>
              <p className="text-sm mt-1 leading-relaxed">{lab.address}</p>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Verification" icon={Shield}>
            <div className={`rounded-xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`rounded-xl p-2 shrink-0 ${verified ? "bg-emerald-100" : "bg-amber-100"}`}>
                  {verified ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Shield className="h-5 w-5 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold capitalize">{lab.verificationStatus}</p>
                  <p className="text-xs text-muted-foreground">Verification status</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-card capitalize">{lab.verificationStatus}</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-3">
              Your laboratory is verified on the Royal Palace platform. Update contact details by contacting your account manager.
            </p>
          </SectionCard>

          <SectionCard title="Profile">
            <p className="text-sm text-muted-foreground leading-relaxed">
              This is a prototype laboratory account. Settings such as notification preferences, billing details, and team members will be available in the production release.
            </p>
          </SectionCard>
        </div>
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
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium mt-0.5 capitalize">{value}</p>
    </div>
  );
}
