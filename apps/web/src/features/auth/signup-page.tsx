"use client";

import { ArrowLeft, ArrowRight, ShieldCheck, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigate, useNav } from "@/lib/nav";

export function SignupPage() {
  const onboardingCode = useNav((state) => state.view.params.code?.trim().toUpperCase());
  const returnTo =
    onboardingCode === undefined ? "/" : `/?referral=${encodeURIComponent(onboardingCode)}`;
  const registrationUrl = `/api/bff/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure registration
              </CardTitle>
              <CardDescription>
                {onboardingCode === undefined
                  ? "After authentication, you can complete your patient profile and enrollment."
                  : `Referral ${onboardingCode} will be retained for the enrollment workflow.`}
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
        </div>
      </main>
    </div>
  );
}
