"use client";

import { navigate } from "@/lib/nav";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Video, FileText, FlaskConical, Pill, Truck, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/healthcare/page-header";

const STEPS = [
  { n: 1, icon: Search, title: "Discover a provider", desc: "Search verified doctors by specialty and online consultation mode, plus pharmacies and laboratories by service." },
  { n: 2, icon: Video, title: "Book & consult", desc: "Pick a slot, complete a quick intake, pay securely and join your consultation." },
  { n: 3, icon: FileText, title: "Structured clinical record", desc: "Your doctor documents the consultation using a structured SOAP-based template. The record is locked & signed." },
  { n: 4, icon: FlaskConical, title: "Laboratory & results", desc: "Your doctor can request tests. You book a lab, samples are collected, results return to your timeline." },
  { n: 5, icon: Pill, title: "Prescription to pharmacy", desc: "Send your prescription to a pharmacy, order medicines and pay — all from your patient portal." },
  { n: 6, icon: Truck, title: "Delivery to your door", desc: "A verified rider picks up your order and delivers it with a verification code." },
];

export function PublicHowItWorks() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title="How Royal Palace works" description="A connected healthcare journey, end to end." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.n}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-emerald-50 p-2.5"><s.icon className="h-5 w-5 text-emerald-600" /></div>
                <span className="text-xs font-bold text-muted-foreground">STEP {s.n}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 rounded-xl bg-emerald-50 border border-emerald-100 p-6 text-center">
        <p className="font-semibold text-emerald-800">Ready to try it?</p>
        <p className="text-sm text-emerald-700 mt-1">Sign in as any demo persona to explore the full journey.</p>
        <button onClick={() => navigate("login", "login")} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
          Explore the demo <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
