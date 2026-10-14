"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import {
  Building2,
  CheckCircle2,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  Shield,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ExpandableCard } from "@/components/healthcare/compact-list";
import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { productionNotificationService } from "@/lib/services";

import { useLabContext } from "../use-lab-context";

type Preference = NotificationComponents["schemas"]["NotificationPreference"];

export function LabSettings() {
  const { workspace, loading, error, reload } = useLabContext();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    try {
      const response = await productionNotificationService.preferences();
      setPreferences([...response.data]);
      setPreferencesError(null);
    } catch (reason) {
      setPreferencesError(
        reason instanceof Error ? reason.message : "Notification preferences could not be loaded.",
      );
    }
  }, []);
  useEffect(() => void loadPreferences(), [loadPreferences]);

  async function updateMarketing(enabled: boolean) {
    const current = preferences.find(
      (preference) => preference.category === "MARKETING" && preference.channel === "EMAIL",
    );
    if (current === undefined) return;
    try {
      const updated = await productionNotificationService.updateEmailMarketing({
        enabled,
        expectedVersion: current.version,
      });
      setPreferences((values) =>
        values.map((value) =>
          value.category === "MARKETING" && value.channel === "EMAIL" ? updated : value,
        ),
      );
      toast.success(enabled ? "Marketing email enabled." : "Marketing email disabled.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Preference could not be saved.");
      await loadPreferences();
    }
  }

  if (loading) return <LoadingState label="Loading laboratory profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (workspace === null) return <ErrorState message="Laboratory profile not found." />;

  const { organization, primaryLocation, registration } = workspace;
  const verified = organization.verificationStatus === "VERIFIED";
  const marketing = preferences.find(
    (preference) => preference.category === "MARKETING" && preference.channel === "EMAIL",
  );
  const address = formatAddress(primaryLocation);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory profile"
        description="Your laboratory's verified profile on Royal Palace."
      />
      <div
        className={
          verified
            ? "rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"
            : "rounded-2xl border border-amber-200 bg-amber-50/40 p-4"
        }
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-3">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">
              {organization.displayName}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {registration?.registrationNumber ?? "Registration pending"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {primaryLocation?.locality ?? "Location not published"}
                {primaryLocation?.administrativeArea
                  ? `, ${primaryLocation.administrativeArea}`
                  : ""}
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500" />
                {workspace.rating.reviewCount === 0
                  ? "No ratings yet"
                  : `${workspace.rating.averageScore?.toFixed(1)} from ${workspace.rating.reviewCount} verified service${workspace.rating.reviewCount === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
          <div
            className={
              verified
                ? "shrink-0 rounded-xl bg-emerald-100 p-2"
                : "shrink-0 rounded-xl bg-amber-100 p-2"
            }
          >
            {verified ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Shield className="h-5 w-5 text-amber-600" />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <ExpandableCard
          defaultOpen
          leading={
            <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
              <Phone className="h-4 w-4 text-sky-600" />
            </div>
          }
          title="Contact details"
          subtitle={organization.publicPhone ?? "No public phone configured"}
        >
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <InfoRow
              icon={Phone}
              label="Phone"
              value={organization.publicPhone ?? "Not published"}
            />
            <InfoRow icon={Mail} label="Email" value="Not published" />
            <InfoRow
              icon={Globe}
              label="Website"
              value={organization.websiteUrl ?? "Not published"}
            />
            <InfoRow
              icon={Globe}
              label="Country"
              value={primaryLocation?.countryCode ?? "Not published"}
            />
          </div>
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3 w-3" /> Address
            </p>
            <p className="text-sm leading-relaxed">{address}</p>
          </div>
        </ExpandableCard>

        <ExpandableCard
          leading={
            <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
              <Shield className="h-4 w-4 text-emerald-600" />
            </div>
          }
          title="Verification"
          subtitle={`Status: ${organization.verificationStatus}`}
          trailing={
            <Badge variant="outline" className="capitalize">
              {organization.verificationStatus.toLowerCase()}
            </Badge>
          }
        >
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Royal Palace administrators control verification after completing the required
              external checks. Laboratory members cannot alter verified identity fields.
            </p>
            <InfoRow label="Legal name" value={organization.legalName} />
            <InfoRow
              label="Registration authority"
              value={registration?.authorityName ?? "Pending review"}
            />
            <InfoRow
              label="Jurisdiction"
              value={registration?.jurisdictionCode ?? "Pending review"}
            />
            {verified && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-xs text-emerald-700">
                  Verified laboratories can participate in qualified laboratory workflows.
                </p>
              </div>
            )}
          </div>
        </ExpandableCard>

        <ExpandableCard
          leading={
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          }
          title="Profile settings"
          subtitle="Notification preferences, billing, team members"
        >
          <div className="space-y-5">
            <ToggleRow
              label="Security and transactional email"
              description="Required account and laboratory workflow messages. Clinical details are never included in external email."
              checked
              disabled
              onCheckedChange={() => undefined}
            />
            <ToggleRow
              label="Marketing email"
              description="Optional Royal Palace updates. Disabled unless you explicitly opt in."
              checked={marketing?.enabled ?? false}
              disabled={marketing === undefined || !marketing.mutable}
              onCheckedChange={(enabled) => void updateMarketing(enabled)}
            />
            {preferencesError && <p className="text-xs text-destructive">{preferencesError}</p>}
            <p className="text-xs text-muted-foreground">
              Billing details and team-member administration remain visible in the approved
              prototype scope and will connect to their governed production aggregates in later
              checkpoints.
            </p>
          </div>
        </ExpandableCard>
      </div>
    </div>
  );
}

function formatAddress(
  location: {
    addressLine1: string | null;
    addressLine2: string | null;
    administrativeArea: string | null;
    countryCode: string;
    locality: string | null;
    postalCode: string | null;
  } | null,
): string {
  if (location === null) return "No address published";
  return [
    location.addressLine1,
    location.addressLine2,
    location.locality,
    location.administrativeArea,
    location.postalCode,
    location.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
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
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}
