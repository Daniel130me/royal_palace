"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import type { PractitionerSettingsResponse } from "@royal-palace/contracts";
import { Bell, Globe, Info, LogOut, Mail, Save, ShieldCheck, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  BottomActionBar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useNav } from "@/lib/nav";
import { productionAccountProfileService, productionNotificationService } from "@/lib/services";

type Preference = NotificationComponents["schemas"]["NotificationPreference"];

export function ProviderSettings() {
  const { logout, sessionEmail } = useNav();
  const [settings, setSettings] = useState<PractitionerSettingsResponse | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [headline, setHeadline] = useState("");
  const [biography, setBiography] = useState("");
  const [languages, setLanguages] = useState("");
  const [acceptingPatients, setAcceptingPatients] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profile, notificationPreferences] = await Promise.all([
        productionAccountProfileService.practitioner.get(),
        productionNotificationService.preferences(),
      ]);
      setSettings(profile);
      setHeadline(profile.headline ?? "");
      setBiography(profile.biography ?? "");
      setLanguages(profile.languageTags.join(", "));
      setAcceptingPatients(profile.acceptingPatients);
      setPreferences([...notificationPreferences.data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const languageTags = useMemo(
    () => [
      ...new Set(
        languages
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    [languages],
  );
  const marketing = preferences.find(
    (item) => item.channel === "EMAIL" && item.category === "MARKETING",
  );

  async function save() {
    if (settings === null) return;
    setSaving(true);
    try {
      const updated = await productionAccountProfileService.practitioner.update({
        acceptingPatients,
        biography: biography.trim() || null,
        expectedVersion: settings.version,
        headline: headline.trim() || null,
        languageTags,
      });
      setSettings(updated);
      setLanguages(updated.languageTags.join(", "));
      toast.success("Practitioner profile updated.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Profile could not be updated.");
      await load();
    } finally {
      setSaving(false);
    }
  }

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

  if (loading) return <LoadingState label="Loading practitioner settings…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (settings === null) return null;

  return (
    <div className="space-y-5 pb-28 lg:pb-0">
      <PageHeader
        title="Settings"
        description="Manage your public profile, communication consent, and account session."
      />

      <SectionCard title="Public practitioner profile" icon={User}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Verified display name" value={settings.displayName} />
          <ReadOnlyField label="Primary specialty" value={settings.primarySpecialty ?? "Not set"} />
          <div className="sm:col-span-2">
            <Label htmlFor="provider-headline">Headline</Label>
            <Input
              id="provider-headline"
              className="mt-1.5"
              maxLength={240}
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="provider-biography">Biography</Label>
            <Textarea
              id="provider-biography"
              className="mt-1.5"
              maxLength={3000}
              rows={5}
              value={biography}
              onChange={(event) => setBiography(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="provider-languages">Languages</Label>
            <Input
              id="provider-languages"
              className="mt-1.5"
              placeholder="en, fr, yo"
              value={languages}
              onChange={(event) => setLanguages(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Enter BCP 47 language tags separated by commas. They are validated by the server.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-semibold">Accepting new patients</p>
              <p className="text-xs text-muted-foreground">
                Controls availability messaging on your verified public profile.
              </p>
            </div>
            <Switch checked={acceptingPatients} onCheckedChange={setAcceptingPatients} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Badge variant="outline">Verification: {settings.verificationStatus.toLowerCase()}</Badge>
          <Button disabled={saving} onClick={() => void save()}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Required notifications" icon={ShieldCheck}>
        <LockedPreference title="Security alerts" />
        <LockedPreference title="Transactional and clinical workflow references" />
        <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" /> External messages contain safe references only;
          no clinical detail is included.
        </p>
      </SectionCard>

      <SectionCard title="Optional communication" icon={Mail}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Marketing email</p>
            <p className="text-xs text-muted-foreground">
              Product news and optional announcements.
            </p>
          </div>
          <Switch
            checked={marketing?.enabled ?? false}
            disabled={marketing === undefined}
            onCheckedChange={(enabled) => void updateMarketing(enabled)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Account and security" icon={Globe}>
        <ReadOnlyField label="Verified email" value={sessionEmail} />
        <p className="mt-3 text-sm text-muted-foreground">
          Passwords, passkeys, MFA, recovery, and verified email changes are managed by the
          qualified identity provider. Royal Palace does not store passwords.
        </p>
        <Button className="mt-4" variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </SectionCard>

      <BottomActionBar>
        <Button className="w-full" disabled={saving} onClick={() => void save()}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
        </Button>
      </BottomActionBar>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input className="mt-1.5" value={value} disabled />
    </div>
  );
}

function LockedPreference({ title }: { title: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-4 rounded-xl border p-3 last:mb-0">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <Switch checked disabled aria-label={`${title} enabled`} />
    </div>
  );
}
