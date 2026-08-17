"use client";

import { useState } from "react";
import { authService } from "@/lib/services";
import { useNav, navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/healthcare/page-header";
import { Stethoscope, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";

// TEMPORARY STUB — Task 2/3 (Public + Auth agent) should overwrite this file
// with the full login page (quick demo persona buttons etc.). Exists only so
// the dev server can compile while parallel agents work.
const DEMO_PERSONAS: { email: string; label: string; portal: "patient" | "provider" | "pharmacy" | "laboratory" | "logistics" | "admin" }[] = [
  { email: "amina@demo.com", label: "Amina · Patient", portal: "patient" },
  { email: "doctor@demo.com", label: "Dr Tunde · Provider", portal: "provider" },
  { email: "pharmacy@demo.com", label: "Grace · Pharmacy", portal: "pharmacy" },
  { email: "lab@demo.com", label: "MedLab · Laboratory", portal: "laboratory" },
  { email: "logistics@demo.com", label: "SwiftCare · Logistics", portal: "logistics" },
  { email: "admin@demo.com", label: "Admin · Console", portal: "admin" },
];

export function LoginPage() {
  const { setSession } = useNav();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function doLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const session = await authService.login(email, password);
      setSession(session as never);
      toast.success("Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function quick(em: string) {
    setEmail(em);
    setPassword("demo123");
    setBusy(true);
    authService
      .login(em, "demo123")
      .then((s) => {
        setSession(s as never);
        toast.success("Signed in");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Login failed"))
      .finally(() => setBusy(false));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 bg-background">
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
      <main className="flex-1 flex items-center justify-center p-4 bg-muted/30">
        <div className="w-full max-w-md space-y-4">
          <PageHeader title="Sign in" description="Use any demo account below — password is demo123." />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account sign-in</CardTitle>
              <CardDescription className="text-xs">Demo prototype — no real authentication.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={doLogin} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="amina@demo.com" className="pl-8" required />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="pl-8" required />
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick demo personas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {DEMO_PERSONAS.map((p) => (
                <Button key={p.email} variant="outline" size="sm" onClick={() => quick(p.email)} disabled={busy} className="justify-between">
                  <span className="truncate">{p.label}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </Button>
              ))}
            </CardContent>
          </Card>
          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("login", "signup")}
              className="font-medium text-emerald-700 hover:underline tap-highlight-none"
            >
              Sign up
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
