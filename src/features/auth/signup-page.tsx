"use client";

import { useMemo, useState } from "react";
import { authService } from "@/lib/services";
import { useNav, navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/healthcare/page-header";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Stethoscope, Mail, Lock, ArrowRight, User, Phone, MapPin,
  Calendar, Heart, ArrowLeft, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const GENDERS = ["Female", "Male", "Unspecified"] as const;
type Gender = (typeof GENDERS)[number];

const NIGERIAN_STATES = [
  "Lagos", "Abuja FCT", "Rivers", "Kano", "Oyo", "Kaduna", "Enugu", "Delta",
  "Ogun", "Edo", "Plateau", "Anambra", "Imo", "Ondo", "Cross River", "Akwa Ibom",
];

interface SignupForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  gender: Gender;
  dateOfBirth: string;
  city: string;
  state: string;
}

const EMPTY: SignupForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  gender: "Unspecified",
  dateOfBirth: "",
  city: "Lagos",
  state: "Lagos",
};

export function SignupPage() {
  const { setSession } = useNav();
  const [form, setForm] = useState<SignupForm>(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const valid = useMemo(() => {
    return (
      form.firstName.trim().length >= 2 &&
      form.lastName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      form.password.length >= 4 &&
      form.dateOfBirth.length > 0
    );
  }, [form]);

  async function doSignup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) {
      toast.error("Please fill in your name, a valid email, date of birth and a password (4+ chars).");
      return;
    }
    setBusy(true);
    try {
      const session = await authService.signup({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        city: form.city,
        state: form.state,
      });
      setSession(session as never);
      toast.success("Welcome to Royal Palace Health Care");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b px-4 py-3 bg-background">
        <button
          onClick={() => navigate("public", "home")}
          className="flex items-center gap-2 tap-highlight-none"
        >
          <div className="rounded-lg bg-emerald-600 p-1.5">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold">Royal Palace Health Care</span>
        </button>
        <Button variant="ghost" size="sm" onClick={() => navigate("login", "login")}>
          <ArrowLeft className="h-4 w-4" /> Sign in
        </Button>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center p-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <PageHeader
            title="Create your account"
            description="Book appointments, order medicines and upload prescriptions in minutes."
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Patient sign up
              </CardTitle>
              <CardDescription className="text-xs">
                Free to join. Prototype — no real account or payment is created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={doSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" id="firstName">
                    <IconInput
                      id="firstName"
                      icon={User}
                      value={form.firstName}
                      onChange={(v) => set("firstName", v)}
                      placeholder="Amina"
                      autoComplete="given-name"
                      required
                    />
                  </Field>
                  <Field label="Last name" id="lastName">
                    <IconInput
                      id="lastName"
                      icon={User}
                      value={form.lastName}
                      onChange={(v) => set("lastName", v)}
                      placeholder="Bello"
                      autoComplete="family-name"
                      required
                    />
                  </Field>
                </div>

                <Field label="Email" id="email">
                  <IconInput
                    id="email"
                    type="email"
                    icon={Mail}
                    value={form.email}
                    onChange={(v) => set("email", v)}
                    placeholder="amina@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone (optional)" id="phone">
                    <IconInput
                      id="phone"
                      type="tel"
                      icon={Phone}
                      value={form.phone}
                      onChange={(v) => set("phone", v)}
                      placeholder="+234 803 ..."
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Date of birth" id="dateOfBirth">
                    <IconInput
                      id="dateOfBirth"
                      type="date"
                      icon={Calendar}
                      value={form.dateOfBirth}
                      onChange={(v) => set("dateOfBirth", v)}
                      required
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Gender" id="gender">
                    <Select value={form.gender} onValueChange={(v) => set("gender", v as Gender)}>
                      <SelectTrigger id="gender" className="w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="State" id="state">
                    <Select value={form.state} onValueChange={(v) => set("state", v)}>
                      <SelectTrigger id="state" className="w-full">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {NIGERIAN_STATES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="City" id="city">
                  <IconInput
                    id="city"
                    icon={MapPin}
                    value={form.city}
                    onChange={(v) => set("city", v)}
                    placeholder="Ikeja"
                    autoComplete="address-level2"
                  />
                </Field>

                <Field label="Password" id="password" hint="At least 4 characters.">
                  <IconInput
                    id="password"
                    type="password"
                    icon={Lock}
                    value={form.password}
                    onChange={(v) => set("password", v)}
                    placeholder="••••••"
                    autoComplete="new-password"
                    required
                  />
                </Field>

                <Button
                  type="submit"
                  disabled={busy || !valid}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? "Creating account…" : "Create account"}
                  {!busy && <ArrowRight className="h-4 w-4 ml-1" />}
                </Button>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground justify-center pt-1">
                  <Heart className="h-3 w-3 text-emerald-500" />
                  <span>By signing up you agree to our terms & privacy policy.</span>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("login", "login")}
              className="font-medium text-emerald-700 hover:underline tap-highlight-none"
            >
              Sign in
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface IconInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
}

function IconInput({ icon: Icon, value, onChange, className, ...rest }: IconInputProps) {
  return (
    <div className="relative">
      <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pl-8 ${className ?? ""}`}
        {...rest}
      />
    </div>
  );
}
