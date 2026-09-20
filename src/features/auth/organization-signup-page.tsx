"use client";

import { useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { enrollmentService } from "@/lib/services";
import { PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";

type OrganizationType = "pharmacy" | "laboratory" | "hospital";

export function OrganizationSignupPage() {
  const { view } = useNav();
  const code = view.params.code?.trim().toUpperCase() ?? "";
  const rawType = view.params.type;
  const type: OrganizationType = rawType === "laboratory" || rawType === "hospital" ? rawType : "pharmacy";
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: "", contactPerson: "", contactEmail: "", contactPhone: "",
    address: "", city: "", state: "", registrationNumber: "", licenceNumber: "",
    services: "", notes: "",
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const valid = useMemo(() => code && Object.entries(form).every(([key, value]) =>
    ["licenceNumber", "services", "notes"].includes(key) || value.trim().length > 0
  ) && (type !== "hospital" || form.services.trim().length > 0), [code, form, type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const result = await enrollmentService.submitOrganization({
        ...form, onboardingCode: code, organizationType: type,
        services: form.services.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setSubmitted(result.applicationNumber);
      toast.success("Enrollment submitted for Royal Palace review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrollment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <div className="min-h-screen grid place-items-center bg-muted/30 p-4"><Card className="w-full max-w-lg"><CardContent className="p-8 text-center space-y-3"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="text-xl font-bold">Application received</h1><p className="text-sm text-muted-foreground">Reference {submitted}. Royal Palace Admin will verify the information and contact the organization.</p><Button onClick={() => navigate("public", "home")}>Return home</Button></CardContent></Card></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("public", "home")}><ArrowLeft className="h-4 w-4" /> Home</Button>
        <PageHeader title={`${type[0].toUpperCase()}${type.slice(1)} enrollment`} description={`Manager code ${code || "missing"} · Only Royal Palace Admin can approve this application.`} />
        <Card><CardContent className="p-5"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name"><Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} required /></Field>
          <Field label="Contact person"><Input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} required /></Field>
          <Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} required /></Field>
          <Field label="Contact phone"><Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} required /></Field>
          <Field label="Address" wide><Input value={form.address} onChange={(e) => set("address", e.target.value)} required /></Field>
          <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} required /></Field>
          <Field label="State"><Input value={form.state} onChange={(e) => set("state", e.target.value)} required /></Field>
          <Field label="Registration number"><Input value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} required /></Field>
          <Field label="Licence number"><Input value={form.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} /></Field>
          {type === "hospital" ? <Field label="Services offered (comma separated)" wide><Textarea value={form.services} onChange={(e) => set("services", e.target.value)} placeholder="Emergency care, Cardiology, Maternity, Paediatrics" required /></Field> : null}
          <Field label="Additional information" wide><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button className="w-full" type="submit" disabled={!valid || busy}><Building2 className="h-4 w-4" />{busy ? "Submitting…" : "Submit for Admin review"}</Button></div>
        </form></CardContent></Card>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label>{label}</Label>{children}</div>;
}
