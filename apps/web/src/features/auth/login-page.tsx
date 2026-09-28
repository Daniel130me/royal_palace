"use client";

import { ArrowRight, ShieldCheck, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigate } from "@/lib/nav";

export function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary p-1.5">
            <Stethoscope className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold">Royal Palace Health Care</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("public", "home")}>
          Back to site
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md space-y-4">
          <PageHeader
            title="Sign in securely"
            description="Continue through the platform identity service. Your password is never handled by this application."
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure account access
              </CardTitle>
              <CardDescription>
                Authentication, recovery, and multi-factor verification are completed by the
                configured identity provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                <a href="/api/bff/auth/login?returnTo=%2F">
                  Continue to sign in <ArrowRight className="ml-1 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
          <p className="text-center text-sm text-muted-foreground">
            New patient?{" "}
            <button
              type="button"
              onClick={() => navigate("login", "signup")}
              className="font-medium text-emerald-700 hover:underline"
            >
              Create an account
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
