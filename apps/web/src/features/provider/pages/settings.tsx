"use client";

import { useState } from "react";
import { useNav } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PageHeader,
  SectionCard,
  BottomActionBar,
} from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { User, Bell, Shield, Globe, Mail, Save, LogOut, BadgeCheck } from "lucide-react";

export function ProviderSettings() {
  const { sessionName, sessionEmail, logout } = useNav();
  const { profile } = useProviderContext();
  const [name, setName] = useState(profile ? `${profile.firstName} ${profile.lastName}` : sessionName);
  const [phone, setPhone] = useState(profile ? profile.userId : "");
  const [email, setEmail] = useState(sessionEmail);
  const [bio, setBio] = useState(profile?.biography ?? "");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [appointmentReminders, setAppointmentReminders] = useState(true);
  const [saving, setSaving] = useState(false);

  function save() {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Settings saved.", { description: "Your preferences have been updated." });
    }, 600);
  }

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title="Settings"
        description="Manage your account, notifications and preferences."
      />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Account */}
          <SectionCard title="Account" icon={User}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Display name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled className="mt-1.5" />
                  <p className="text-[10px] text-muted-foreground mt-1">Email changes require verification.</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Specialty</Label>
                  <Input value={profile?.specialty ?? ""} disabled className="mt-1.5" />
                  <p className="text-[10px] text-muted-foreground mt-1">Set by verification team.</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Biography (shown on your public profile)</Label>
                <Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </SectionCard>

          {/* Notification preferences */}
          <SectionCard title="Notifications" icon={Bell} description="Choose how you want to be alerted">
            <div className="space-y-2.5">
              <PrefRow label="Email alerts" description="Receive notifications by email." checked={emailAlerts} onChange={setEmailAlerts} />
              <PrefRow label="SMS alerts" description="Receive appointment reminders by SMS." checked={smsAlerts} onChange={setSmsAlerts} />
              <PrefRow label="Appointment reminders" description="15-min warning before each consultation." checked={appointmentReminders} onChange={setAppointmentReminders} />
            </div>
          </SectionCard>

          <SectionCard title="Security" icon={Shield}>
            <div className="space-y-3">
              <Button variant="outline" className="w-full sm:w-auto justify-start" onClick={() => toast.info("Password reset link sent", { description: "Check your email to set a new password." })}>
                <Mail className="h-4 w-4 mr-2" /> Reset password
              </Button>
              <Separator />
              <Button variant="outline" className="w-full sm:w-auto justify-start" onClick={() => toast.info("2FA setup", { description: "Two-factor authentication setup will open here." })}>
                <Shield className="h-4 w-4 mr-2" /> Enable two-factor authentication
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="lg:sticky lg:top-20 space-y-5">
            {/* Profile mini card */}
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {(profile?.firstName?.[0] ?? "D")}{(profile?.lastName?.[0] ?? "")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{profile ? `${profile.title} ${profile.firstName} ${profile.lastName}` : sessionName}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.specialty}</p>
                </div>
              </div>
              <Button className="w-full mt-3" disabled={saving} onClick={save}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
              </Button>
              <Separator className="my-3" />
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Provider No.</span><span className="font-medium">{profile?.providerNumber}</span></div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">Verification</span>
                  {profile?.verificationStatus === "approved" ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 capitalize h-5 text-[10px]">
                      <BadgeCheck className="h-3 w-3 mr-1" /> {profile?.verificationStatus.replace(/_/g, " ")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="capitalize h-5 text-[10px]">{profile?.verificationStatus.replace(/_/g, " ")}</Badge>
                  )}
                </div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Languages</span><span className="font-medium truncate text-right">{profile?.languages.join(", ") ?? "—"}</span></div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Globe className="h-3 w-3" /> Account information
              </p>
              <p>Your account is linked to user <span className="font-mono text-foreground">{profile?.userId ?? "—"}</span>. Account deletion requests must be submitted in writing.</p>
              <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-rose-600 hover:text-rose-700" onClick={() => toast.error("Account deletion requires admin approval.")}>
                Request account deletion
              </Button>
            </div>

            <Button variant="outline" className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile sticky save bar */}
      <BottomActionBar>
        <Button className="w-full" disabled={saving} onClick={save}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
        </Button>
      </BottomActionBar>
    </div>
  );
}

function PrefRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/80 bg-card p-3.5">
      <div className="min-w-0 pr-3">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
