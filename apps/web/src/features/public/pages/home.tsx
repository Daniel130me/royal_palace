"use client";

import { useEffect, useState } from "react";
import type { PublicPractitionerSummary } from "@royal-palace/contracts";
import { navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { publicDiscoveryService } from "@/lib/services";
import { formatPractitionerLocation } from "@/lib/public-location";
import {
  Stethoscope,
  Video,
  FlaskConical,
  Pill,
  Truck,
  ShieldCheck,
  Clock,
  ArrowRight,
  HeartPulse,
  Activity,
  Baby,
  Brain,
  Microscope,
  Search,
  CheckCircle2,
  FileText,
} from "lucide-react";

const CATEGORIES = [
  {
    icon: Stethoscope,
    label: "Doctor Consultation",
    desc: "Video, voice & chat",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: HeartPulse,
    label: "Dental Care",
    desc: "Check-ups & procedures",
    color: "bg-rose-100 text-rose-700",
  },
  {
    icon: FlaskConical,
    label: "Laboratory Tests",
    desc: "Home & facility",
    color: "bg-violet-100 text-violet-700",
  },
  { icon: Pill, label: "Pharmacy", desc: "Order & delivery", color: "bg-amber-100 text-amber-700" },
  {
    icon: Activity,
    label: "Chronic Care",
    desc: "Ongoing management",
    color: "bg-sky-100 text-sky-700",
  },
  {
    icon: Brain,
    label: "Preventive Healthcare",
    desc: "Wellness screening",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: Baby,
    label: "Home Healthcare",
    desc: "Visits at home",
    color: "bg-teal-100 text-teal-700",
  },
];

const JOURNEY = [
  { icon: Search, title: "Find Care", desc: "Discover verified doctors, pharmacies and labs." },
  {
    icon: Video,
    title: "Consultation",
    desc: "Meet your provider securely by video, voice or chat.",
  },
  {
    icon: FileText,
    title: "Medical Records",
    desc: "A structured, continuous clinical record is created.",
  },
  {
    icon: FlaskConical,
    title: "Laboratory",
    desc: "Tests requested, booked and results returned.",
  },
  { icon: Pill, title: "Pharmacy", desc: "Prescriptions sent, medicines ordered." },
  { icon: Truck, title: "Delivery", desc: "Medicines delivered to your door." },
];

export function PublicHome() {
  const [providers, setProviders] = useState<readonly PublicPractitionerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    publicDiscoveryService
      .practitioners({ limit: 4 }, controller.signal)
      .then(({ data }) => setProviders(data))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setProviders([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-background">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified providers · Trusted care
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">
              Healthcare that <span className="text-emerald-600">stays connected.</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl">
              Royal Palace unifies consultations, medical records, laboratory, pharmacy and delivery
              into one continuous care journey — so nothing falls between providers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => navigate("public", "providers")}
              >
                <Search className="h-4 w-4 mr-2" /> Find a doctor
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("login", "login")}>
                Sign in to your portal
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="font-semibold text-emerald-700">Independent verification</p>
                <p className="text-muted-foreground">Practitioners and organizations</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-700">Privacy-minimized access</p>
                <p className="text-muted-foreground">Only necessary information is shared</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-700">Location-aware discovery</p>
                <p className="text-muted-foreground">Search across supported regions</p>
              </div>
            </div>
          </div>

          {/* Search card */}
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <h2 className="font-semibold">Find the care you need</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Search verified doctors, pharmacies and laboratories.
              </p>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. Cardiologist, Dentist, Pharmacy…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate("public", "providers");
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("public", "providers")}
                  >
                    Doctors
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("patient", "hospitals")}
                  >
                    Hospitals
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("public", "pharmacies")}
                  >
                    Pharmacies
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("public", "laboratories")}
                  >
                    Laboratories
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold">A full spectrum of healthcare</h2>
          <p className="mt-2 text-muted-foreground">
            From everyday consultations to chronic care management — all in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => navigate("public", "providers")}
              className="group rounded-xl border bg-background p-4 text-left hover:border-emerald-400 hover:shadow-sm transition-all"
            >
              <div className={`mb-3 inline-flex rounded-lg p-2.5 ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <p className="font-medium text-sm">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS / JOURNEY */}
      <section className="bg-muted/30 py-14">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">How Royal Palace works</h2>
            <p className="mt-2 text-muted-foreground">
              A connected journey from your first consultation to medicine delivery.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {JOURNEY.map((j, i) => (
              <div key={j.title} className="relative rounded-xl border bg-background p-4">
                <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2.5">
                  <j.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="font-semibold text-sm">
                  {i + 1}. {j.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{j.desc}</p>
                {i < JOURNEY.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED DOCTORS */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Featured verified doctors</h2>
            <p className="mt-2 text-muted-foreground">
              Published practitioners who completed independent platform verification.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("public", "providers")}>
            View all <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />
            ))
          ) : providers.length > 0 ? (
            providers.map((provider) => (
              <PractitionerMiniCard key={provider.id} practitioner={provider} />
            ))
          ) : (
            <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Verified practitioners will appear here when published.
            </p>
          )}
        </div>
      </section>

      {/* LAB + PHARMACY */}
      <section className="mx-auto max-w-7xl px-4 pb-14 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-violet-100 p-2.5">
                <FlaskConical className="h-5 w-5 text-violet-600" />
              </div>
              <h3 className="font-semibold">Laboratory services</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Book tests, get samples collected at home, and receive results directly in your
              medical record.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Search by controlled
                laboratory service
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> See verified facility
                locations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Home collection shown only
                where offered
              </li>
            </ul>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => navigate("public", "laboratories")}
            >
              Explore laboratories
            </Button>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-amber-100 p-2.5">
                <Pill className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-semibold">Pharmacy & delivery</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Send your prescription to a pharmacy, order medicines, and get them delivered.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Prescription verification
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Doorstep delivery
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Order tracking
              </li>
            </ul>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => navigate("public", "pharmacies")}
            >
              Explore pharmacies
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* TRUST */}
      <section className="bg-emerald-700 text-white py-14">
        <div className="mx-auto max-w-7xl px-4 grid gap-8 lg:grid-cols-3 text-center">
          <div>
            <ShieldCheck className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Verified providers</p>
            <p className="text-sm text-emerald-100 mt-1">
              Every doctor, pharmacy and lab is verified before joining.
            </p>
          </div>
          <div>
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Continuous records</p>
            <p className="text-sm text-emerald-100 mt-1">
              Your clinical timeline follows you across every provider.
            </p>
          </div>
          <div>
            <Microscope className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Consent-first</p>
            <p className="text-sm text-emerald-100 mt-1">
              You control who sees your medical information.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {[
            {
              q: "Is my data private?",
              a: "Access is role-limited and purpose-bound. Clinical information is not exposed through public discovery.",
            },
            {
              q: "Can I book a remote consultation?",
              a: "When a verified practitioner publishes a supported remote mode and an available slot, it appears in their profile for booking.",
            },
            {
              q: "How are prices set?",
              a: "The platform displays the effective currency and amount stored for the specific service or appointment. A browser redirect never confirms payment.",
            },
            {
              q: "Can medicines be delivered?",
              a: "Eligible pharmacy orders can enter the delivery workflow when the selected pharmacy and destination support it.",
            },
          ].map((f) => (
            <details key={f.q} className="group rounded-lg border bg-background p-4">
              <summary className="cursor-pointer font-medium text-sm flex items-center justify-between">
                {f.q}
                <ArrowRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 sm:p-12 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Ready to experience connected healthcare?
          </h2>
          <p className="mt-2 text-emerald-50">
            Sign in to continue to the portal authorized for your account.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-6"
            onClick={() => navigate("login", "login")}
          >
            Sign in securely
          </Button>
        </div>
      </section>
    </div>
  );
}

function PractitionerMiniCard({ practitioner }: { practitioner: PublicPractitionerSummary }) {
  const primaryLocation = practitioner.locations[0];
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate("public", "provider", { id: practitioner.id })}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
            {practitioner.displayName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{practitioner.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {practitioner.specialties.map(({ name }) => name).join(" · ") ||
                practitioner.professions.map(({ name }) => name).join(" · ")}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {practitioner.yearsExperience === null ? null : (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {practitioner.yearsExperience}y
                </span>
              )}
              {primaryLocation === undefined ? null : (
                <span className="truncate text-xs text-muted-foreground">
                  {formatPractitionerLocation(primaryLocation)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-emerald-700">
            {practitioner.acceptingPatients ? "View live availability" : "View profile"}
          </span>
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        </div>
      </CardContent>
    </Card>
  );
}
