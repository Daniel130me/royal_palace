"use client";

import { navigate } from "@/lib/nav";
import { PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Stethoscope, Smile, FlaskConical, Pill, HeartPulse, ShieldPlus,
  Home, ArrowRight, Phone, Video, FileText, Sparkles,
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
    id: "doctor-consultation",
    title: "Doctor Consultation",
    description: "Video, audio, in-person or chat consults with verified doctors across 30+ specialties.",
    icon: Stethoscope,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    bullets: ["Video, audio, in-person or chat", "Verified GPs & specialists", "From ₦15,000"],
    cta: { label: "Find a doctor", page: "doctors" },
  },
  {
    id: "dental-care",
    title: "Dental Care",
    description: "Dental consultations, scaling, fillings and oral health check-ups from trusted dentists.",
    icon: Smile,
    tone: "bg-sky-50 text-sky-700 border-sky-100",
    bullets: ["Dental consultations", "Scaling & polishing", "From ₦20,000"],
    cta: { label: "Find dental care", page: "doctors", params: { specialty: "Dentist" } },
  },
  {
    id: "laboratory-tests",
    title: "Laboratory Tests",
    description: "Book lab tests, schedule home sample collection and review results online.",
    icon: FlaskConical,
    tone: "bg-violet-50 text-violet-700 border-violet-100",
    bullets: ["200+ tests available", "Facility or home collection", "Results in 24–48 hrs"],
    cta: { label: "View lab tests", page: "laboratory" },
  },
  {
    id: "pharmacy",
    title: "Pharmacy",
    description: "Order prescription & OTC medicines from verified pharmacies with home delivery.",
    icon: Pill,
    tone: "bg-amber-50 text-amber-700 border-amber-100",
    bullets: ["Order from your prescription", "Verified pharmacies", "Same-day delivery"],
    cta: { label: "View prescriptions", page: "prescriptions" },
  },
  {
    id: "chronic-care",
    title: "Chronic Care",
    description: "Structured care programmes for hypertension, diabetes, asthma & more.",
    icon: HeartPulse,
    tone: "bg-rose-50 text-rose-700 border-rose-100",
    bullets: ["Monthly care programmes", "Care plan tracking", "From ₦30,000/mo"],
    cta: { label: "View care plans", page: "records" },
  },
  {
    id: "preventive-healthcare",
    title: "Preventive Healthcare",
    description: "Wellness screenings and preventive health packages for individuals and families.",
    icon: ShieldPlus,
    tone: "bg-teal-50 text-teal-700 border-teal-100",
    bullets: ["Wellness packages", "Annual check-ups", "From ₦60,000"],
    cta: { label: "View pricing", page: "doctors" },
  },
  {
    id: "home-healthcare",
    title: "Home Healthcare",
    description: "Book a healthcare professional to visit you at home for assessments & care.",
    icon: Home,
    tone: "bg-orange-50 text-orange-700 border-orange-100",
    bullets: ["Home visits", "Trained caregivers", "From ₦40,000"],
    cta: { label: "Book home visit", page: "doctors" },
  },
];

const QUICK_LINKS: { icon: React.ComponentType<{ className?: string }>; label: string; page: string }[] = [
  { icon: Video, label: "Video consult", page: "doctors" },
  { icon: Phone, label: "Audio call", page: "doctors" },
  { icon: Pill, label: "Refill medicine", page: "prescriptions" },
  { icon: FileText, label: "Health records", page: "records" },
];

export function PatientServices() {
  return (
    <div>
      <PageHeader
        title="Find Care"
        description="Browse our healthcare categories and connect with trusted providers."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {QUICK_LINKS.map((q) => (
          <button
            key={q.label}
            onClick={() => navigate("patient", q.page)}
            className="rounded-lg border bg-background p-4 text-left hover:border-emerald-400 hover:shadow-sm transition-all"
          >
            <q.icon className="h-5 w-5 text-emerald-600 mb-2" />
            <p className="text-sm font-medium leading-tight">{q.label}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.id} className="flex flex-col">
              <CardContent className="p-5 flex flex-col h-full">
                <div className={`inline-flex w-fit rounded-lg border p-2.5 ${cat.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold">{cat.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cat.description}</p>
                <ul className="mt-3 space-y-1">
                  {cat.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-emerald-500" /> {b}
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
  );
}
