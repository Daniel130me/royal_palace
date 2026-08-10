"use client";

import { Card, CardContent } from "@/components/ui/card";
import { navigate } from "@/lib/nav";
import { formatCurrency } from "@/lib/format";
import { Stethoscope, HeartPulse, FlaskConical, Pill, Activity, Brain, Baby, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/healthcare/page-header";

const SERVICES = [
  { icon: Stethoscope, title: "Doctor Consultation", desc: "General practitioners and specialists available by video, audio, chat or in-person.", price: 15000, page: "providers", color: "bg-emerald-100 text-emerald-700" },
  { icon: HeartPulse, title: "Dental Care", desc: "Check-ups, scaling, fillings and specialist dental procedures.", price: 20000, page: "providers", color: "bg-rose-100 text-rose-700" },
  { icon: FlaskConical, title: "Laboratory Tests", desc: "Book tests at a facility or request home sample collection.", price: 3000, page: "laboratories", color: "bg-violet-100 text-violet-700" },
  { icon: Pill, title: "Pharmacy", desc: "Order prescription and over-the-counter medicines with delivery.", price: 1500, page: "pharmacies", color: "bg-amber-100 text-amber-700" },
  { icon: Activity, title: "Chronic Care", desc: "Ongoing management of hypertension, diabetes and other conditions.", price: 30000, page: "pricing", color: "bg-sky-100 text-sky-700" },
  { icon: Brain, title: "Preventive Healthcare", desc: "Wellness screening packages to stay ahead of disease.", price: 60000, page: "pricing", color: "bg-indigo-100 text-indigo-700" },
  { icon: Baby, title: "Home Healthcare", desc: "Qualified practitioners visiting you at home.", price: 40000, page: "pricing", color: "bg-teal-100 text-teal-700" },
];

export function PublicServices() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title="Our services" description="A connected spectrum of healthcare services, all on one platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => (
          <Card key={s.title} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className={`inline-flex rounded-lg p-3 ${s.color} mb-4`}><s.icon className="h-6 w-6" /></div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">From <span className="font-semibold text-foreground">{formatCurrency(s.price)}</span></span>
                <button onClick={() => navigate("public", s.page as any)} className="text-sm text-emerald-600 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                  Explore <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
