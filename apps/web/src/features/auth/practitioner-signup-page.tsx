"use client";

import type {
  PublicOrganizationSummary,
  PublicProfession,
  PublicSpecialty,
} from "@royal-palace/contracts";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { navigate, useNav } from "@/lib/nav";
import { onboardingService, publicDiscoveryService } from "@/lib/services";

export function PractitionerSignupPage() {
  const authenticated = useNav((state) => state.authenticated);
  const [professions, setProfessions] = useState<readonly PublicProfession[]>([]);
  const [specialties, setSpecialties] = useState<readonly PublicSpecialty[]>([]);
  const [hospitals, setHospitals] = useState<readonly PublicOrganizationSummary[]>([]);
  const [professionIds, setProfessionIds] = useState<string[]>([]);
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    biography: "",
    credentialType: "",
    facilityName: "",
    familyName: "",
    givenName: "",
    honorific: "",
    jurisdictionCode: "",
    registrationAuthority: "",
    registrationNumber: "",
    selectedOrganizationId: "",
  });

  useEffect(() => {
    Promise.all([
      publicDiscoveryService.professions(),
      publicDiscoveryService.specialties(),
      publicDiscoveryService.hospitals({ limit: 50 }),
    ])
      .then(([professionResult, specialtyResult, hospitalResult]) => {
        setProfessions(professionResult.data);
        setSpecialties(specialtyResult.data);
        setHospitals(hospitalResult.data);
      })
      .catch(() => toast.error("The clinical catalogue could not be loaded."));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (professionIds.length === 0 || specialtyIds.length === 0) {
      toast.error("Select at least one profession and specialty.");
      return;
    }
    setBusy(true);
    try {
      const selectedOrganizationId = form.selectedOrganizationId || null;
      const selectedHospital = hospitals.find((hospital) => hospital.id === selectedOrganizationId);
      const draft = await onboardingService.createPractitioner({
        biography: form.biography || null,
        credentialType: form.credentialType,
        facilityName: (selectedHospital?.displayName ?? form.facilityName) || null,
        familyName: form.familyName,
        givenName: form.givenName,
        honorific: form.honorific || null,
        jurisdictionCode: form.jurisdictionCode,
        professionIds,
        registrationAuthority: form.registrationAuthority,
        registrationNumber: form.registrationNumber,
        selectedOrganizationId,
        specialtyIds,
      });
      const result = await onboardingService.submit(draft.id, draft.version);
      setSubmitted(result.id);
      toast.success("Practitioner verification was submitted for administrator review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <CenteredCard>
        <Stethoscope className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="text-xl font-bold">Sign in to start practitioner verification</h1>
        <p className="text-sm text-muted-foreground">
          Your professional registration is submitted by you and verified independently by Royal
          Palace Admin.
        </p>
        <Button asChild className="w-full">
          <a href="/api/bff/auth/login?returnTo=%2F%23%2Flogin%2Fpractitioner-signup">
            Continue securely
          </a>
        </Button>
      </CenteredCard>
    );
  }

  if (submitted !== null) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-bold">Verification submitted</h1>
        <p className="text-sm text-muted-foreground">
          Application {submitted} is ready for independent administrator review.
        </p>
        <Button onClick={() => navigate("public", "home")}>Return home</Button>
      </CenteredCard>
    );
  }

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="min-h-screen bg-muted/30 p-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("login", "signup")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <PageHeader
          title="Practitioner verification"
          description="Facility affiliation is optional and does not affect Royal Palace Admin’s independent verification decision."
        />
        <Card>
          <CardContent className="p-5">
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <Field label="Given name">
                <Input
                  value={form.givenName}
                  onChange={(event) => set("givenName", event.target.value)}
                  required
                />
              </Field>
              <Field label="Family name">
                <Input
                  value={form.familyName}
                  onChange={(event) => set("familyName", event.target.value)}
                  required
                />
              </Field>
              <Field label="Honorific">
                <Input
                  value={form.honorific}
                  onChange={(event) => set("honorific", event.target.value)}
                  placeholder="Dr"
                />
              </Field>
              <Field label="Credential type">
                <Input
                  value={form.credentialType}
                  onChange={(event) => set("credentialType", event.target.value)}
                  required
                />
              </Field>
              <Field label="Registration authority">
                <Input
                  value={form.registrationAuthority}
                  onChange={(event) => set("registrationAuthority", event.target.value)}
                  required
                />
              </Field>
              <Field label="Registration jurisdiction">
                <Input
                  value={form.jurisdictionCode}
                  onChange={(event) => set("jurisdictionCode", event.target.value)}
                  required
                />
              </Field>
              <Field label="Registration number">
                <Input
                  value={form.registrationNumber}
                  onChange={(event) => set("registrationNumber", event.target.value)}
                  required
                />
              </Field>
              <Field label="Verified facility (optional)">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.selectedOrganizationId}
                  onChange={(event) => set("selectedOrganizationId", event.target.value)}
                >
                  <option value="">No listed facility selected</option>
                  {hospitals.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Facility name (optional)" wide>
                <Input
                  value={form.facilityName}
                  onChange={(event) => set("facilityName", event.target.value)}
                  disabled={form.selectedOrganizationId !== ""}
                  placeholder="Type a facility that is not listed"
                />
              </Field>
              <Field label="Biography" wide>
                <Textarea
                  value={form.biography}
                  onChange={(event) => set("biography", event.target.value)}
                />
              </Field>
              <SelectionGrid
                label="Professions"
                entries={professions}
                selected={professionIds}
                onChange={setProfessionIds}
              />
              <SelectionGrid
                label="Specialties"
                entries={specialties}
                selected={specialtyIds}
                onChange={setSpecialtyIds}
              />
              <Button className="sm:col-span-2" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit for administrator review"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SelectionGrid({
  label,
  entries,
  selected,
  onChange,
}: {
  label: string;
  entries: readonly { id: string; name: string }[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Field label={label} wide>
      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <label
            key={entry.id}
            className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={selected.includes(entry.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, entry.id]
                    : selected.filter((id) => id !== entry.id),
                )
              }
            />
            {entry.name}
          </label>
        ))}
      </div>
    </Field>
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

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-4 p-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}
