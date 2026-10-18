"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import type { PatientProfileResponse } from "@royal-palace/contracts";
import { Bell, Globe, Info, LogOut, Mail, Phone, Save, ShieldCheck, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  BottomActionBar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { navigate, useNav } from "@/lib/nav";
import { productionAccountProfileService, productionNotificationService } from "@/lib/services";

type Preference = NotificationComponents["schemas"]["NotificationPreference"];

export function PatientSettings() {
  const { logout, sessionEmail } = useNav();
  const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [emergencyContact, setEmergencyContact] = useState({
    displayName: "",
    phoneE164: "",
    relationship: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountProfile, notificationPreferences] = await Promise.all([
        productionAccountProfileService.patient.get(),
        productionNotificationService.preferences(),
      ]);
      setProfile(accountProfile);
      setPreferredLanguage(accountProfile.preferredLanguage ?? "");
      setEmergencyContact({
        displayName: accountProfile.emergencyContact?.displayName ?? "",
        phoneE164: accountProfile.emergencyContact?.phoneE164 ?? "",
        relationship: accountProfile.emergencyContact?.relationship ?? "",
      });
      setPreferences([...notificationPreferences.data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const marketing = preferences.find(
    (item) => item.channel === "EMAIL" && item.category === "MARKETING",
  );

  async function save() {
    if (profile === null) return;
    const normalizedContact = {
      displayName: emergencyContact.displayName.trim(),
      phoneE164: emergencyContact.phoneE164.trim(),
      relationship: emergencyContact.relationship.trim(),
    };
    const contactValues = Object.values(normalizedContact);
    const hasContact = contactValues.some((value) => value.length > 0);
    if (hasContact && contactValues.some((value) => value.length === 0)) {
      toast.error("Complete all emergency-contact fields or clear all three fields.");
      return;
    }
    setSaving(true);
    try {
      const updated = await productionAccountProfileService.patient.update({
        emergencyContact: hasContact ? normalizedContact : null,
        expectedVersion: profile.version,
        preferredLanguage: preferredLanguage.trim() || null,
      });
      setProfile(updated);
      setPreferredLanguage(updated.preferredLanguage ?? "");
      setEmergencyContact({
        displayName: updated.emergencyContact?.displayName ?? "",
        phoneE164: updated.emergencyContact?.phoneE164 ?? "",
        relationship: updated.emergencyContact?.relationship ?? "",
      });
      toast.success("Patient preferences updated.");
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

  if (loading) return <LoadingState label="Loading patient settings…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (profile === null) return null;

  return (
    <div className="space-y-5 pb-28 lg:pb-0">
      <PageHeader
        title="Settings"
        description="Manage account preferences, communication consent, and privacy access."
      />

      <SectionCard title="Verified patient profile" icon={User}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="First name" value={profile.givenName} />
          <ReadOnlyField label="Last name" value={profile.familyName} />
          <ReadOnlyField label="Date of birth" value={profile.dateOfBirth ?? "Not provided"} />
          <ReadOnlyField label="Phone" value={profile.phoneE164 ?? "Not provided"} />
          <ReadOnlyField label="Country" value={profile.countryCode ?? "Not provided"} />
          <div>
            <Label htmlFor="preferred-language">Preferred language</Label>
            <Input
              id="preferred-language"
              className="mt-1.5"
              maxLength={35}
              placeholder="en, fr, en-GB"
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use a BCP 47 language tag. The server validates and standardizes it.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={saving} onClick={() => void save()}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save preference"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Emergency contact"
        icon={Phone}
        description="Used only for an emergency or an approved care workflow."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="emergency-name">Name</Label>
            <Input
              id="emergency-name"
              className="mt-1.5"
              maxLength={160}
              value={emergencyContact.displayName}
              onChange={(event) =>
                setEmergencyContact((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="emergency-phone">International phone number</Label>
            <Input
              id="emergency-phone"
              className="mt-1.5"
              maxLength={16}
              placeholder="+14165550100"
              value={emergencyContact.phoneE164}
              onChange={(event) =>
                setEmergencyContact((current) => ({
                  ...current,
                  phoneE164: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="emergency-relationship">Relationship</Label>
            <Input
              id="emergency-relationship"
              className="mt-1.5"
              maxLength={100}
              placeholder="Parent, spouse, friend"
              value={emergencyContact.relationship}
              onChange={(event) =>
                setEmergencyContact((current) => ({
                  ...current,
                  relationship: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Enter a full international number beginning with +. Clearing all fields removes the
          contact.
        </p>
      </SectionCard>

      <SectionCard title="Required notifications" icon={ShieldCheck}>
        <LockedPreference title="Security alerts" />
        <LockedPreference title="Transactional and care-workflow references" />
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

      <SectionCard title="Privacy and account security" icon={Globe}>
        <ReadOnlyField label="Verified email" value={sessionEmail} />
        <p className="mt-3 text-sm text-muted-foreground">
          Identity changes, passwords, passkeys, MFA, and recovery are handled through the qualified
          identity service and may require re-verification.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("patient", "consent")}>
            <ShieldCheck className="h-4 w-4" /> Open Record Access Centre
          </Button>
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </SectionCard>

      <BottomActionBar>
        <Button className="w-full" disabled={saving} onClick={() => void save()}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save preference"}
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
