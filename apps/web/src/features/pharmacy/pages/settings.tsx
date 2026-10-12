"use client";

import type { NotificationComponents, PrescriptionComponents } from "@royal-palace/api-client";
import { Building2, LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNav } from "@/lib/nav";
import { productionNotificationService, productionPrescriptionService } from "@/lib/services";

type Settings = PrescriptionComponents["schemas"]["PharmacyOperationalSettings"];
type Preference = NotificationComponents["schemas"]["NotificationPreference"];

export function PharmacySettings() {
  const organizationId = useNav().session?.profileId;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [operational, notificationPreferences] = await Promise.all([
        productionPrescriptionService.pharmacy.settings(organizationId),
        productionNotificationService.preferences(),
      ]);
      setSettings(operational);
      setPreferences([...notificationPreferences.data]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => void load(), [load]);

  async function saveOperationalSettings() {
    if (!organizationId || settings === null) return;
    if (!settings.pickupEnabled && !settings.deliveryEnabled) {
      toast.error("Enable at least one fulfilment method");
      return;
    }
    setSaving(true);
    try {
      const updated = await productionPrescriptionService.pharmacy.updateSettings(organizationId, {
        deliveryEnabled: settings.deliveryEnabled,
        expectedVersion: settings.version,
        pickupEnabled: settings.pickupEnabled,
        preparationTargetMinutes: settings.preparationTargetMinutes,
      });
      setSettings(updated);
      toast.success("Operational settings saved");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Settings could not be saved");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateMarketing(enabled: boolean) {
    const current = preferences.find(
      ({ category, channel }) => category === "MARKETING" && channel === "EMAIL",
    );
    if (!current) return;
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
      toast.success(enabled ? "Marketing email enabled" : "Marketing email disabled");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Preference could not be saved");
      await load();
    }
  }

  if (loading && settings === null) return <SkeletonGrid count={3} />;
  if (error || settings === null)
    return (
      <EmptyState
        title="Settings unavailable"
        description={error ?? "Pharmacy settings were not found"}
      />
    );
  const marketing = preferences.find(
    ({ category, channel }) => category === "MARKETING" && channel === "EMAIL",
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Manage pharmacy operations and communication preferences."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Pharmacy identity
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Organization" value={settings.organization.displayName} />
          <div className="space-y-1.5">
            <Label>Verification</Label>
            <div>
              <Badge variant="outline">{settings.organization.verificationStatus}</Badge>
            </div>
          </div>
          <ReadOnlyField
            label="Public phone"
            value={settings.organization.publicPhone ?? "Not published"}
          />
          <ReadOnlyField
            label="Website"
            value={settings.organization.websiteUrl ?? "Not published"}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            <LockKeyhole className="h-3.5 w-3.5" /> Verified identity fields are controlled through
            the approved organization review workflow.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Fulfilment operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            label="Patient pickup"
            description="Allow completed orders to be collected at the pharmacy."
            checked={settings.pickupEnabled}
            onCheckedChange={(pickupEnabled) => setSettings({ ...settings, pickupEnabled })}
          />
          <ToggleRow
            label="Delivery handoff"
            description="Allow prepared orders to enter the controlled delivery workflow."
            checked={settings.deliveryEnabled}
            onCheckedChange={(deliveryEnabled) => setSettings({ ...settings, deliveryEnabled })}
          />
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="preparation-target">Preparation target (minutes)</Label>
            <Input
              id="preparation-target"
              type="number"
              min={5}
              max={10080}
              value={settings.preparationTargetMinutes}
              onChange={(event) =>
                setSettings({ ...settings, preparationTargetMinutes: Number(event.target.value) })
              }
            />
          </div>
          <Button disabled={saving} onClick={() => void saveOperationalSettings()}>
            {saving ? "Saving…" : "Save operational settings"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            label="Security and transactional email"
            description="Required account, payment, prescription, and order messages. Clinical details are never included in external email."
            checked
            disabled
            onCheckedChange={() => undefined}
          />
          <ToggleRow
            label="Marketing email"
            description="Optional product and service updates. Disabled unless you explicitly opt in."
            checked={marketing?.enabled ?? false}
            disabled={marketing === undefined || !marketing.mutable}
            onCheckedChange={(enabled) => void updateMarketing(enabled)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} readOnly aria-readonly />
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
