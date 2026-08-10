"use client";

import { useLabContext } from "../use-lab-context";
import { PageHeader } from "@/components/healthcare/page-header";
import { LoadingState, ErrorState } from "@/components/healthcare/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, Mail, MapPin, Star, Shield } from "lucide-react";

export function LabSettings() {
  const { lab, loading, error, reload } = useLabContext();

  if (loading) return <LoadingState label="Loading laboratory profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  return (
    <div>
      <PageHeader
        title="Laboratory profile"
        description="Your laboratory's verified profile on Royal Palace."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {lab.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoRow label="Laboratory number" value={lab.laboratoryNumber} />
              <InfoRow label="Verification status" value={lab.verificationStatus} />
              <InfoRow label="Phone" value={lab.phone} icon={Phone} />
              <InfoRow label="Email" value={lab.email} icon={Mail} />
              <InfoRow label="City" value={lab.city} icon={MapPin} />
              <InfoRow label="State" value={lab.state} icon={MapPin} />
              <InfoRow label="Rating" value={`${lab.rating.toFixed(1)} ★`} icon={Star} />
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Address</p>
              <p className="text-sm mt-1">{lab.address}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><Shield className="h-4 w-4" /> Verification</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">{lab.verificationStatus}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Your laboratory is verified on the Royal Palace platform. Update contact details by contacting your account manager.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>This is a prototype laboratory account. Settings such as notification preferences, billing details, and team members will be available in the production release.</p>
            </CardContent>
          </Card>
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
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium mt-0.5 capitalize">{value}</p>
    </div>
  );
}
