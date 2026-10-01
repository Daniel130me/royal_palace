"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { navigate, useNav } from "@/lib/nav";
import { onboardingService } from "@/lib/services";

export function SignupPage() {
  const { authenticated, view } = useNav();
  const referralToken = view.params.code?.trim();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    countryCode: "",
    dateOfBirth: "",
    familyName: "",
    givenName: "",
    phoneE164: "",
    preferredLanguage: "",
  });
  const returnTo =
    referralToken === undefined
      ? "/#/login/signup"
      : `/#/login/signup?code=${encodeURIComponent(referralToken)}`;
  const registrationUrl = `/api/bff/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const draft = await onboardingService.createPatient(
        {
          countryCode: form.countryCode === "" ? null : form.countryCode.toUpperCase(),
          dateOfBirth: form.dateOfBirth || null,
          familyName: form.familyName,
          givenName: form.givenName,
          phoneE164: form.phoneE164 || null,
          preferredLanguage: form.preferredLanguage || null,
        },
        referralToken,
      );
      const application = await onboardingService.submit(draft.id, draft.version);
      setSubmitted(application.id);
      toast.success("Patient enrollment submitted for review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrollment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <button onClick={() => navigate("public", "home")} className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-600 p-1.5">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold">Royal Palace Health Care</span>
        </button>
        <Button variant="ghost" size="sm" onClick={() => navigate("login", "login")}>
          <ArrowLeft className="h-4 w-4" /> Sign in
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4">
          <PageHeader
            title="Create your account"
            description="Account credentials and verification are handled securely outside the application."
          />
          {!authenticated ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure registration
                </CardTitle>
                <CardDescription>
                  {referralToken === undefined
                    ? "After authentication, you can complete your patient profile and enrollment."
                    : "Your secure referral will be retained for the enrollment workflow."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <a href={registrationUrl}>
                    Continue to registration <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Patient enrollment</CardTitle>
                <CardDescription>
                  {submitted
                    ? `Application ${submitted} was submitted for review.`
                    : "Complete your own patient profile. Support can review it; only an administrator can approve it."}
                </CardDescription>
              </CardHeader>
              {!submitted ? (
                <CardContent>
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
                    <Field label="Given name">
                      <Input
                        value={form.givenName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, givenName: event.target.value }))
                        }
                        required
                      />
                    </Field>
                    <Field label="Family name">
                      <Input
                        value={form.familyName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, familyName: event.target.value }))
                        }
                        required
                      />
                    </Field>
                    <Field label="Date of birth">
                      <Input
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, dateOfBirth: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Phone (E.164)">
                      <Input
                        value={form.phoneE164}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, phoneE164: event.target.value }))
                        }
                        placeholder="+442071838750"
                      />
                    </Field>
                    <Field label="Country code (ISO alpha-2)">
                      <Input
                        maxLength={2}
                        value={form.countryCode}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            countryCode: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Preferred language tag">
                      <Input
                        value={form.preferredLanguage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            preferredLanguage: event.target.value,
                          }))
                        }
                        placeholder="en-GB"
                      />
                    </Field>
                    <Button className="sm:col-span-2" type="submit" disabled={busy}>
                      {busy ? "Submitting…" : "Submit for review"}
                    </Button>
                    <Button
                      className="sm:col-span-2"
                      type="button"
                      variant="outline"
                      onClick={() => navigate("login", "practitioner-signup")}
                    >
                      I am onboarding as a practitioner
                    </Button>
                  </form>
                </CardContent>
              ) : null}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
