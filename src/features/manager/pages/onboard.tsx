"use client";

// Onboard Organization (plan §3.4). The manager shares their onboarding code
// link with a business owner, or registers the organization directly. Royal
// Palace reviews every submitted application before approval creates the
// organization and its first assignment.

import { useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { navigate } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Building2, FlaskConical, Copy, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Manager } from "@/types";

interface FormState {
  businessName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  registrationNumber: string;
  licenceNumber: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  businessName: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  city: "",
  state: "",
  registrationNumber: "",
  licenceNumber: "",
  notes: "",
};

const REQUIRED_FIELDS: (keyof FormState)[] = [
  "businessName",
  "contactPerson",
  "contactEmail",
  "contactPhone",
  "address",
  "city",
  "state",
  "registrationNumber",
];

const FIELD_LABELS: Record<keyof FormState, string> = {
  businessName: "Business name",
  contactPerson: "Contact person",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  address: "Address",
  city: "City",
  state: "State",
  registrationNumber: "Registration number",
  licenceNumber: "Licence number",
  notes: "Notes",
};

export function ManagerOnboard() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orgType, setOrgType] = useState<"pharmacy" | "laboratory">("pharmacy");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    managerService
      .me()
      .then((d) => {
        if (!live) return;
        setManager(d.manager);
        setLink(`${window.location.origin}/#/login/login?code=${d.manager.onboardingCode}`);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load your manager profile."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  function setField(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Onboarding link copied — share it with the business owner.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not access the clipboard — copy the link manually.");
    }
  }

  async function save(submit: boolean) {
    const missing = REQUIRED_FIELDS.filter((f) => !form[f].trim());
    if (missing.length > 0) {
      setFormError(`Please fill in: ${missing.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}.`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await managerService.submitApplication({ organizationType: orgType, ...form, submit });
      toast.success(submit ? "Application submitted — Royal Palace will review it shortly." : "Draft saved — submit it from Applications when ready.");
      setForm(EMPTY_FORM);
      navigate("manager", "applications");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit the application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading onboarding details…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!manager) return null;

  return (
    <div>
      <PageHeader
        title="Onboard Organization"
        description="Share your onboarding link, or register a pharmacy or laboratory. Royal Palace reviews every application before approval."
      />

      {/* Manager code + onboarding link */}
      <Card className="mb-4">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="sm:w-56 shrink-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Manager code</p>
              <p className="mt-1 text-2xl font-bold tracking-wide">{manager.onboardingCode}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Manager ID {manager.managerNumber}</p>
            </div>
            <div className="min-w-0 flex-1 sm:border-l sm:border-border/60 sm:pl-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Onboarding link</p>
              <p className="mt-1 text-sm font-medium break-all">{link}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Share this link with a business owner — it carries your manager code.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void copyLink()} className="shrink-0 self-start sm:self-center">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Application form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Application details</CardTitle>
          <CardDescription>All required fields are reviewed by Royal Palace before the organization joins your portfolio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pharmacy", "laboratory"] as const).map((t) => {
                const Icon = t === "pharmacy" ? Building2 : FlaskConical;
                const selectedType = orgType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOrgType(t)}
                    aria-pressed={selectedType}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium capitalize transition-colors",
                      selectedType
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" /> {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="onboard-business-name">Business name *</Label>
              <Input id="onboard-business-name" value={form.businessName} onChange={(e) => setField("businessName", e.target.value)} placeholder="e.g. Ikeja Central Laboratory" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-contact-person">Contact person *</Label>
              <Input id="onboard-contact-person" value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-contact-email">Contact email *</Label>
              <Input id="onboard-contact-email" type="email" value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} placeholder="name@business.ng" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-contact-phone">Contact phone *</Label>
              <Input id="onboard-contact-phone" type="tel" value={form.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} placeholder="+234 …" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onboard-address">Address *</Label>
              <Input id="onboard-address" value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="Street address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-city">City *</Label>
              <Input id="onboard-city" value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="e.g. Lagos" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-state">State *</Label>
              <Input id="onboard-state" value={form.state} onChange={(e) => setField("state", e.target.value)} placeholder="e.g. Lagos" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-registration">Registration number *</Label>
              <Input id="onboard-registration" value={form.registrationNumber} onChange={(e) => setField("registrationNumber", e.target.value)} placeholder="e.g. RC-771010" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboard-licence">Licence number</Label>
              <Input id="onboard-licence" value={form.licenceNumber} onChange={(e) => setField("licenceNumber", e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onboard-notes">Notes</Label>
              <Textarea id="onboard-notes" rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Anything Royal Palace should know about this organization" />
            </div>
          </div>

          {formError ? <p className="text-sm font-medium text-rose-600">{formError}</p> : null}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => void save(true)} disabled={submitting} className="sm:flex-1">
              <UserPlus className="h-4 w-4" /> {submitting ? "Submitting…" : "Submit application"}
            </Button>
            <Button variant="outline" onClick={() => void save(false)} disabled={submitting}>
              Save as draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
