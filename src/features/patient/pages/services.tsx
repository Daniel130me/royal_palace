"use client";

import { navigate } from "@/lib/nav";
import { PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Stethoscope, Smile, FlaskConical, Pill, HeartPulse, ShieldPlus,
  Home, ArrowRight, Phone, Video, FileText, Sparkles,
  Building2,
} from "lucide-react";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  bullets: string[];
  cta: { label: string; page: string; params?: Record<string, string> };
}

const CATEGORIES: Category[] = [
  {
    id: "hospitals",
    title: "Hospitals",
    description: "Find verified hospitals by the exact service, specialty or facility you need.",
    icon: Building2,
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    bullets: ["Filter by service", "Verified facilities", "Emergency and 24-hour options"],
    cta: { label: "Find a hospital", page: "hospitals" },
  },
  {
    id: "doctor-consultation",
    title: "Doctor Consultation",
    description: "Video, voice or chat consultations with verified doctors across 30+ specialties.",
    icon: Stethoscope,
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    bullets: ["Video, voice or chat", "Verified GPs & specialists", "From ₦15,000"],
    cta: { label: "Find a doctor", page: "doctors" },
  },
  {
    id: "dental-care",
    title: "Dental Care",
    description: "Dental consultations, scaling, fillings and oral health check-ups from trusted dentists.",
    icon: Smile,
    tone: "bg-sky-50 text-sky-700 ring-sky-100",
    bullets: ["Dental consultations", "Scaling & polishing", "From ₦20,000"],
    cta: { label: "Find dental care", page: "doctors", params: { specialty: "Dentist" } },
  },
  {
    id: "laboratory-tests",
    title: "Laboratory Tests",
    description: "Book lab tests, schedule home sample collection and review results online.",
    icon: FlaskConical,
    tone: "bg-violet-50 text-violet-700 ring-violet-100",
    bullets: ["200+ tests available", "Facility or home collection", "Results in 24–48 hrs"],
    cta: { label: "Find a laboratory", page: "laboratories" },
  },
  {
    id: "pharmacy",
    title: "Pharmacy",
    description: "Order prescription & OTC medicines from verified pharmacies with home delivery.",
    icon: Pill,
    tone: "bg-amber-50 text-amber-700 ring-amber-100",
    bullets: ["Order from your prescription", "Buy OTC medicines directly", "Same-day delivery"],
    cta: { label: "Find a pharmacy", page: "pharmacies" },
  },
  {
    id: "chronic-care",
    title: "Chronic Care",
    description: "Structured care programmes for hypertension, diabetes, asthma & more.",
    icon: HeartPulse,
    tone: "bg-rose-50 text-rose-700 ring-rose-100",
    bullets: ["Monthly care programmes", "Care plan tracking", "From ₦30,000/mo"],
    cta: { label: "View care plans", page: "records" },
  },
  {
    id: "preventive-healthcare",
    title: "Preventive Healthcare",
    description: "Wellness screenings and preventive health packages for individuals and families.",
    icon: ShieldPlus,
    tone: "bg-teal-50 text-teal-700 ring-teal-100",
    bullets: ["Wellness packages", "Annual check-ups", "From ₦60,000"],
    cta: { label: "View pricing", page: "doctors" },
  },
  {
    id: "home-healthcare",
    title: "Home Healthcare",
    description: "Book a healthcare professional to visit you at home for assessments & care.",
    icon: Home,
    tone: "bg-orange-50 text-orange-700 ring-orange-100",
    bullets: ["Home visits", "Trained caregivers", "From ₦40,000"],
    cta: { label: "Book home visit", page: "doctors" },
  },
];

const QUICK_LINKS: { icon: React.ComponentType<{ className?: string }>; label: string; sub: string; page: string }[] = [
  { icon: Video, label: "Video consult", sub: "See a doctor now", page: "doctors" },
  { icon: Phone, label: "Audio call", sub: "Talk on the phone", page: "doctors" },
  { icon: Pill, label: "Refill medicine", sub: "From your prescription", page: "prescriptions" },
  { icon: FileText, label: "Health records", sub: "View timeline", page: "records" },
];

export function PatientServices() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Care"
        description="Browse our healthcare categories and connect with trusted providers."
      />

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_LINKS.map((q) => {
          const Icon = q.icon;
          return (
            <button
              key={q.label}
              onClick={() => navigate("patient", q.page)}
              className="group rounded-2xl border border-border/80 bg-card p-4 text-left shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30 tap-highlight-none"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-2.5 text-sm font-semibold leading-tight">{q.label}</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">{q.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Service categories */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">All services</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card key={cat.id} className="flex flex-col hover:shadow-soft-md transition-shadow">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className={`inline-flex w-fit rounded-xl p-2.5 ring-1 ${cat.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-semibold tracking-tight">{cat.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
                  <ul className="mt-3 space-y-1.5">
                    {cat.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => navigate("patient", cat.cta.page, cat.cta.params)}
                    >
                      {cat.cta.label}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
