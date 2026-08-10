"use client";

import { useState } from "react";
import { useNav } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { User, Bell, Shield, Globe, Mail, Phone, Save, LogOut } from "lucide-react";

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
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account, notifications and preferences."
        actions={
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Account */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Display name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled />
                  <p className="text-[10px] text-muted-foreground mt-1">Email changes require verification.</p>
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" />
                </div>
                <div>
                  <Label className="text-xs">Specialty</Label>
                  <Input value={profile?.specialty ?? ""} disabled />
                </div>
              </div>
              <div>
                <Label className="text-xs">Biography (shown on your public profile)</Label>
                <Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Notification preferences */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <PrefRow label="Email alerts" description="Receive notifications by email." checked={emailAlerts} onChange={setEmailAlerts} />
              <PrefRow label="SMS alerts" description="Receive appointment reminders by SMS." checked={smsAlerts} onChange={setSmsAlerts} />
              <PrefRow label="Appointment reminders" description="15-min warning before each consultation." checked={appointmentReminders} onChange={setAppointmentReminders} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Security</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" onClick={() => toast.info("Password reset link sent", { description: "Check your email to set a new password." })}>
                <Mail className="h-4 w-4 mr-1" /> Reset password
              </Button>
              <Separator />
              <Button variant="outline" onClick={() => toast.info("2FA setup", { description: "Two-factor authentication setup will open here." })}>
                <Shield className="h-4 w-4 mr-1" /> Enable two-factor authentication
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-16">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                  {(profile?.firstName?.[0] ?? "D")}{(profile?.lastName?.[0] ?? "")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{profile ? `${profile.title} ${profile.firstName} ${profile.lastName}` : sessionName}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.specialty}</p>
                </div>
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={save}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
              </Button>
              <Separator />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Provider No.</span><span className="font-medium">{profile?.providerNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Verification</span><Badge variant="outline" className="capitalize">{profile?.verificationStatus.replace(/_/g, " ")}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Languages</span><span className="font-medium truncate">{profile?.languages.join(", ") ?? "—"}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> Account information</p>
              <p>Your account is linked to user <span className="font-mono">{profile?.userId ?? "—"}</span>. Account deletion requests must be submitted in writing.</p>
              <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-rose-600" onClick={() => toast.error("Account deletion requires admin approval.")}>
                Request account deletion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PrefRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

void Phone;
