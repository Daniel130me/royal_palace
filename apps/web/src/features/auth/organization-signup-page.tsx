"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicService } from "@royal-palace/contracts";
import { useNav, navigate } from "@/lib/nav";
import { onboardingService, publicDiscoveryService } from "@/lib/services";
import { PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";

type OrganizationType = "pharmacy" | "laboratory" | "hospital";

export function OrganizationSignupPage() {
  const { authenticated, view } = useNav();
  const referralToken = view.params.code?.trim() ?? "";
  const rawType = view.params.type;
  const type: OrganizationType =
    rawType === "laboratory" || rawType === "hospital" ? rawType : "pharmacy";
  const returnParameters = new URLSearchParams({ type });
  if (referralToken.length > 0) returnParameters.set("code", referralToken);
  const returnTo = `/#/login/organization-signup?${returnParameters.toString()}`;
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<readonly PublicService[]>([]);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    city: "",
    administrativeArea: "",
    postalCode: "",
    countryCode: "",
    registrationAuthority: "",
    jurisdictionCode: "",
    registrationNumber: "",
  });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const valid = useMemo(
    () =>
      Object.entries(form).every(
        ([key, value]) => ["contactPhone", "postalCode"].includes(key) || value.trim().length > 0,
      ) && serviceIds.length > 0,
    [form, serviceIds],
  );

  useEffect(() => {
    const organizationType = type.toUpperCase() as "HOSPITAL" | "PHARMACY" | "LABORATORY";
    publicDiscoveryService
      .services(organizationType)
      .then((result) => setServices(result.data))
      .catch((error: unknown) =>
        setServiceError(error instanceof Error ? error.message : "Services could not be loaded."),
      );
  }, [type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const draft = await onboardingService.createOrganization(
        {
          addressLine1: form.address,
          addressLine2: null,
          administrativeArea: form.administrativeArea,
          contactEmail: form.contactEmail,
          contactName: form.contactPerson,
          contactPhoneE164: form.contactPhone || null,
          countryCode: form.countryCode.toUpperCase(),
          displayName: form.businessName,
          jurisdictionCode: form.jurisdictionCode,
          legalName: form.businessName,
          locality: form.city,
          organizationType: type.toUpperCase() as "HOSPITAL" | "PHARMACY" | "LABORATORY",
          postalCode: form.postalCode || null,
          registrationAuthority: form.registrationAuthority,
          registrationNumber: form.registrationNumber,
          serviceIds,
        },
        referralToken || undefined,
      );
      const result = await onboardingService.submit(draft.id, draft.version);
      setSubmitted(result.id);
      toast.success("Enrollment submitted for Royal Palace review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrollment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-xl font-bold">Application received</h1>
            <p className="text-sm text-muted-foreground">
              Reference {submitted}. Royal Palace Admin will verify the information and contact the
              organization.
            </p>
            <Button onClick={() => navigate("public", "home")}>Return home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="text-xl font-bold">Sign in to onboard your organization</h1>
            <p className="text-sm text-muted-foreground">
              The applicant must authenticate and submit the organization’s own information. A
              manager referral link does not give the manager access to the application.
            </p>
            <Button asChild className="w-full">
              <a href={`/api/bff/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
                Continue securely
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("public", "home")}>
          <ArrowLeft className="h-4 w-4" /> Home
        </Button>
        <PageHeader
          title={`${type[0].toUpperCase()}${type.slice(1)} enrollment`}
          description={`${referralToken ? "Secure referral retained · " : ""}Sign in first, then submit the organization’s own information. Only Royal Palace Admin can approve it.`}
        />
        <Card>
          <CardContent className="p-5">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name">
                <Input
                  value={form.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  required
                />
              </Field>
              <Field label="Contact person">
                <Input
                  value={form.contactPerson}
                  onChange={(e) => set("contactPerson", e.target.value)}
                  required
                />
              </Field>
              <Field label="Contact email">
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                  required
                />
              </Field>
              <Field label="Contact phone">
                <Input
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  required
                />
              </Field>
              <Field label="Address" wide>
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  required
                />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} required />
              </Field>
              <Field label="State / province / region">
                <Input
                  value={form.administrativeArea}
                  onChange={(e) => set("administrativeArea", e.target.value)}
                  required
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </Field>
              <Field label="Country code (ISO alpha-2)">
                <Input
                  value={form.countryCode}
                  maxLength={2}
                  onChange={(e) => set("countryCode", e.target.value.toUpperCase())}
                  placeholder="GB"
                  required
                />
              </Field>
              <Field label="Registration authority">
                <Input
                  value={form.registrationAuthority}
                  onChange={(e) => set("registrationAuthority", e.target.value)}
                  required
                />
              </Field>
              <Field label="Registration jurisdiction">
                <Input
                  value={form.jurisdictionCode}
                  onChange={(e) => set("jurisdictionCode", e.target.value)}
                  placeholder="Regulator-defined jurisdiction"
                  required
                />
              </Field>
              <Field label="Registration number">
                <Input
                  value={form.registrationNumber}
                  onChange={(e) => set("registrationNumber", e.target.value)}
                  required
                />
              </Field>
              <Field label="Services offered" wide>
                {serviceError ? (
                  <p className="text-sm text-destructive">{serviceError}</p>
                ) : services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Loading governed service catalogue…
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {services.map((service) => (
                      <label
                        key={service.id}
                        className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={serviceIds.includes(service.id)}
                          onChange={(event) =>
                            setServiceIds((current) =>
                              event.target.checked
                                ? [...current, service.id]
                                : current.filter((id) => id !== service.id),
                            )
                          }
                        />
                        <span>{service.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Button className="w-full" type="submit" disabled={!valid || busy}>
                  <Building2 className="h-4 w-4" />
                  {busy ? "Submitting…" : "Submit for Admin review"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
