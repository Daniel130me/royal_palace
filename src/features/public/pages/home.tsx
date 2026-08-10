"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { formatCurrency } from "@/lib/format";
import {
  Stethoscope, Video, FlaskConical, Pill, Truck, ShieldCheck, Star, Clock, ArrowRight,
  HeartPulse, Activity, Baby, Brain, Microscope, Search, CheckCircle2, FileText,
} from "lucide-react";

const CATEGORIES = [
  { icon: Stethoscope, label: "Doctor Consultation", desc: "Video & in-person", color: "bg-emerald-100 text-emerald-700" },
  { icon: HeartPulse, label: "Dental Care", desc: "Check-ups & procedures", color: "bg-rose-100 text-rose-700" },
  { icon: FlaskConical, label: "Laboratory Tests", desc: "Home & facility", color: "bg-violet-100 text-violet-700" },
  { icon: Pill, label: "Pharmacy", desc: "Order & delivery", color: "bg-amber-100 text-amber-700" },
  { icon: Activity, label: "Chronic Care", desc: "Ongoing management", color: "bg-sky-100 text-sky-700" },
  { icon: Brain, label: "Preventive Healthcare", desc: "Wellness screening", color: "bg-indigo-100 text-indigo-700" },
  { icon: Baby, label: "Home Healthcare", desc: "Visits at home", color: "bg-teal-100 text-teal-700" },
];

const JOURNEY = [
  { icon: Search, title: "Find Care", desc: "Discover verified doctors, pharmacies and labs." },
  { icon: Video, title: "Consultation", desc: "Video or in-person consultation with your provider." },
  { icon: FileText, title: "Medical Records", desc: "A structured, continuous clinical record is created." },
  { icon: FlaskConical, title: "Laboratory", desc: "Tests requested, booked and results returned." },
  { icon: Pill, title: "Pharmacy", desc: "Prescriptions sent, medicines ordered." },
  { icon: Truck, title: "Delivery", desc: "Medicines delivered to your door." },
];

export function PublicHome() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    providerService.list().then((p) => {
      setProviders(p.filter((x) => x.verificationStatus === "approved").slice(0, 4));
      setLoading(false);
    });
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
              Royal Palace unifies consultations, medical records, laboratory, pharmacy and
              delivery into one continuous care journey — so nothing falls between providers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("public", "providers")}>
                <Search className="h-4 w-4 mr-2" /> Find a doctor
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("login", "login")}>
                Sign in to your portal
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div><p className="text-2xl font-bold text-emerald-600">12k+</p><p className="text-muted-foreground">Consultations</p></div>
              <div><p className="text-2xl font-bold text-emerald-600">240+</p><p className="text-muted-foreground">Verified providers</p></div>
              <div><p className="text-2xl font-bold text-emerald-600">4.8★</p><p className="text-muted-foreground">Avg. rating</p></div>
            </div>
          </div>

          {/* Search card */}
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <h2 className="font-semibold">Find the care you need</h2>
              <p className="text-sm text-muted-foreground mt-1">Search verified doctors, pharmacies and laboratories.</p>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. Cardiologist, Dentist, Pharmacy…"
                    onKeyDown={(e) => { if (e.key === "Enter") navigate("public", "providers"); }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("public", "providers")}>Doctors</Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("public", "pharmacies")}>Pharmacies</Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("public", "laboratories")}>Laboratories</Button>
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
          <p className="mt-2 text-muted-foreground">From everyday consultations to chronic care management — all in one place.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => navigate("public", "providers")}
              className="group rounded-xl border bg-background p-4 text-left hover:border-emerald-400 hover:shadow-sm transition-all"
            >
              <div className={`mb-3 inline-flex rounded-lg p-2.5 ${c.color}`}><c.icon className="h-5 w-5" /></div>
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
            <p className="mt-2 text-muted-foreground">A connected journey from your first consultation to medicine delivery.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {JOURNEY.map((j, i) => (
              <div key={j.title} className="relative rounded-xl border bg-background p-4">
                <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2.5"><j.icon className="h-5 w-5 text-emerald-600" /></div>
                <p className="font-semibold text-sm">{i + 1}. {j.title}</p>
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
            <p className="mt-2 text-muted-foreground">Trusted specialists across Lagos and beyond.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("public", "providers")}>View all <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />)
          ) : (
            providers.map((p) => <ProviderMiniCard key={p.id} provider={p} />)
          )}
        </div>
      </section>

      {/* LAB + PHARMACY */}
      <section className="mx-auto max-w-7xl px-4 pb-14 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-violet-100 p-2.5"><FlaskConical className="h-5 w-5 text-violet-600" /></div>
              <h3 className="font-semibold">Laboratory services</h3>
            </div>
            <p className="text-sm text-muted-foreground">Book tests, get samples collected at home, and receive results directly in your medical record.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Full Blood Count — {formatCurrency(5000)}</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Lipid Profile — {formatCurrency(8000)}</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Home sample collection available</li>
            </ul>
            <Button variant="outline" className="mt-5" onClick={() => navigate("public", "laboratories")}>Explore laboratories</Button>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-amber-100 p-2.5"><Pill className="h-5 w-5 text-amber-600" /></div>
              <h3 className="font-semibold">Pharmacy & delivery</h3>
            </div>
            <p className="text-sm text-muted-foreground">Send your prescription to a pharmacy, order medicines, and get them delivered.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Prescription verification</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Doorstep delivery</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Order tracking</li>
            </ul>
            <Button variant="outline" className="mt-5" onClick={() => navigate("public", "pharmacies")}>Explore pharmacies</Button>
          </CardContent>
        </Card>
      </section>

      {/* TRUST */}
      <section className="bg-emerald-700 text-white py-14">
        <div className="mx-auto max-w-7xl px-4 grid gap-8 lg:grid-cols-3 text-center">
          <div>
            <ShieldCheck className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Verified providers</p>
            <p className="text-sm text-emerald-100 mt-1">Every doctor, pharmacy and lab is verified before joining.</p>
          </div>
          <div>
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Continuous records</p>
            <p className="text-sm text-emerald-100 mt-1">Your clinical timeline follows you across every provider.</p>
          </div>
          <div>
            <Microscope className="h-8 w-8 mx-auto mb-2" />
            <p className="font-semibold">Consent-first</p>
            <p className="text-sm text-emerald-100 mt-1">You control who sees your medical information.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Frequently asked questions</h2>
        <div className="space-y-3">
          {[
            { q: "Is my data private?", a: "Yes. You control record access and can revoke it at any time. All prototype data is synthetic and fictional." },
            { q: "Can I book a video consultation?", a: "Yes. Choose a video consultation when booking. Video is simulated in this prototype — a real WebRTC provider will plug in later." },
            { q: "How are prices set?", a: "Royal Palace controls patient-facing prices for consultations, laboratory and delivery. Pharmacies manage their own medicine prices." },
            { q: "Do you deliver medicines?", a: "Yes. After ordering from a pharmacy, a logistics rider picks up and delivers your order with a verification code." },
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
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to experience connected healthcare?</h2>
          <p className="mt-2 text-emerald-50">Sign in as a patient, doctor, pharmacy, laboratory, logistics or admin.</p>
          <Button size="lg" variant="secondary" className="mt-6" onClick={() => navigate("login", "login")}>
            Sign in to a demo portal
          </Button>
        </div>
      </section>
    </div>
  );
}

function ProviderMiniCard({ provider }: { provider: Provider }) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("public", "provider", { id: provider.id })}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
            {provider.firstName[0]}{provider.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{provider.title} {provider.firstName} {provider.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{provider.specialty}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-0.5 text-xs"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{provider.rating}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{provider.yearsExperience}y</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-emerald-700">From {formatCurrency(provider.consultationFee)}</span>
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        </div>
      </CardContent>
    </Card>
  );
}
