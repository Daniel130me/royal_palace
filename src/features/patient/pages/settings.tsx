"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";
import { PageHeader, LoadingState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, User, Phone, MapPin, Heart, Activity, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["AA", "AS", "AC", "SS", "SC", "CC"];
const NIGERIAN_STATES = ["Lagos", "Abuja FCT", "Rivers", "Kano", "Oyo", "Kaduna", "Enugu", "Delta", "Edo", "Ogun"];

export function PatientSettings() {
  const { profile, primary, refresh } = usePatientContext();
  const [form, setForm] = useState<Partial<Patient>>({});
  const [emergency, setEmergency] = useState({ name: "", phone: "", rel: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        email: profile.email,
        city: profile.city,
        state: profile.state,
        bloodGroup: profile.bloodGroup ?? "",
        genotype: profile.genotype ?? "",
        height: profile.height ?? null,
        weight: profile.weight ?? null,
      });
      setEmergency({
        name: profile.emergencyName ?? "",
        phone: profile.emergencyPhone ?? "",
        rel: profile.emergencyRel ?? "",
      });
    }
  }, [profile?.id]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    try {
      await patientService.update(profile.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        city: form.city,
        state: form.state,
        bloodGroup: form.bloodGroup || null,
        genotype: form.genotype || null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        emergencyName: emergency.name || null,
        emergencyPhone: emergency.phone || null,
        emergencyRel: emergency.rel || null,
      });
      toast.success("Profile updated");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <LoadingState label="Loading profile…" />;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your profile and emergency contact."
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={save}>
            <Save className="h-4 w-4 mr-1" /> {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Personal information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <Input value={form.firstName ?? ""} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName ?? ""} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="City">
                <Input value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </Field>
              <Field label="State">
                <Select value={form.state ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Heart className="h-4 w-4" /> Health information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Blood group">
                <Select value={form.bloodGroup ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, bloodGroup: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Genotype">
                <Select value={form.genotype ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, genotype: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
                  <SelectContent>
                    {GENOTYPES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Height (cm)">
                <Input type="number" value={form.height ?? ""} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value ? Number(e.target.value) : null }))} />
              </Field>
              <Field label="Weight (kg)">
                <Input type="number" value={form.weight ?? ""} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value ? Number(e.target.value) : null }))} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Emergency contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <Input value={emergency.name} onChange={(e) => setEmergency((s) => ({ ...s, name: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input value={emergency.phone} onChange={(e) => setEmergency((s) => ({ ...s, phone: e.target.value }))} />
              </Field>
              <Field label="Relationship">
                <Input value={emergency.rel} onChange={(e) => setEmergency((s) => ({ ...s, rel: e.target.value }))} placeholder="e.g. Spouse" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Self-reported health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">Update your conditions, allergies, and medicines from the dashboard. Items you add here are marked as patient-reported and can be confirmed by your provider during a consultation.</p>
              <div className="flex flex-wrap gap-2">
                {(profile.conditions ?? []).map((c, i) => (
                  <Badge key={i} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <AlertCircle className="h-3 w-3 mr-1" /> {c.name}
                  </Badge>
                ))}
                {(profile.allergies ?? []).map((c, i) => (
                  <Badge key={`a${i}`} variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                    <AlertCircle className="h-3 w-3 mr-1" /> {c.name}
                  </Badge>
                ))}
                {(profile.medications ?? []).map((c, i) => (
                  <Badge key={`m${i}`} variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                    {c.name}
                  </Badge>
                ))}
                {profile.conditions.length === 0 && profile.allergies.length === 0 && profile.medications.length === 0 && (
                  <p className="text-xs text-muted-foreground">None recorded yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Patient profile</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Patient number" value={<span className="font-mono">{profile.patientNumber}</span>} />
              <Row label="Account type" value={primary && profile.id === primary.id ? "Primary account" : "Dependant"} />
              <Row label="Date of birth" value={profile.dateOfBirth} />
              <Row label="Gender" value={profile.gender} />
              <Row label="Member since" value={(() => { const c = createdAt(profile); return c ? new Date(c).toLocaleDateString("en-GB") : "—"; })()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Privacy & access</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">Manage who can see your records.</p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("patient", "consent")}>
                Open Record Access Centre
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
