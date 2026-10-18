"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import { Bell, Info, LogOut, Mail, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNav } from "@/lib/nav";
import { productionNotificationService } from "@/lib/services";

type Preference = NotificationComponents["schemas"]["NotificationPreference"];

export function ManagerSettings() {
  const { logout } = useNav();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await productionNotificationService.preferences();
      setPreferences([...response.data]);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Notification preferences could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const marketing = preferences.find(
    (item) => item.channel === "EMAIL" && item.category === "MARKETING",
  );

  async function updateMarketing(enabled: boolean) {
    if (marketing === undefined) return;
    try {
      const updated = await productionNotificationService.updateEmailMarketing({
        enabled,
        expectedVersion: marketing.version,
      });
      setPreferences((current) =>
        current.map((item) =>
          item.channel === "EMAIL" && item.category === "MARKETING" ? updated : item,
        ),
      );
      toast.success(enabled ? "Marketing email enabled." : "Marketing email disabled.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Preference could not be saved.");
      await load();
    }
  }

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Communication preferences and account controls for the Manager Portal."
      />
      <SectionCard
        title="Required notifications"
        icon={ShieldCheck}
        description="Security and transactional delivery"
      >
        <div className="space-y-3">
          <LockedPreference
            icon={ShieldCheck}
            title="Security alerts"
            description="Sign-in, account, and security events are mandatory."
          />
          <LockedPreference
            icon={Bell}
            title="Transactional updates"
            description="Referral, earnings, payout, and support updates are mandatory."
          />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          External notifications contain references and safe summaries only. Clinical details are
          never included.
        </p>
      </SectionCard>
      <SectionCard title="Optional communication" icon={Mail} description="Explicit consent">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="manager-marketing-email" className="text-sm font-semibold">
              Marketing email
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Product news and optional programme announcements.
            </p>
          </div>
          <Switch
            id="manager-marketing-email"
            checked={marketing?.enabled ?? false}
            disabled={marketing === undefined}
            onCheckedChange={(enabled) => void updateMarketing(enabled)}
          />
        </div>
      </SectionCard>
      <Card className="border-rose-200">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Sign out</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              End your Manager Portal session on this device.
            </p>
          </div>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LockedPreference({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked disabled aria-label={`${title} enabled`} />
    </div>
  );
}
