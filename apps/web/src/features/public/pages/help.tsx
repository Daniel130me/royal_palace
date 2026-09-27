"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, Phone, MessageCircle, LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/healthcare/page-header";

export function PublicHelp() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Help & support" description="Find answers and reach our support team." />
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card><CardContent className="p-5 text-center"><LifeBuoy className="h-6 w-6 mx-auto text-emerald-600 mb-2" /><p className="font-medium text-sm">24/7 Support</p><p className="text-xs text-muted-foreground">Always here to help</p></CardContent></Card>
        <Card><CardContent className="p-5 text-center"><Mail className="h-6 w-6 mx-auto text-emerald-600 mb-2" /><p className="font-medium text-sm">Email</p><p className="text-xs text-muted-foreground">support@royalpalace.ng</p></CardContent></Card>
        <Card><CardContent className="p-5 text-center"><Phone className="h-6 w-6 mx-auto text-emerald-600 mb-2" /><p className="font-medium text-sm">Hotline</p><p className="text-xs text-muted-foreground">0800 ROYAL PALACE</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Common questions</h2>
          <Accordion type="single" collapsible>
            {[
              { q: "How do I book a consultation?", a: "Sign in as a patient, go to Find Care → Doctors, pick a provider and complete the booking flow. Mock payment confirms your slot instantly." },
              { q: "Can I manage my family's health?", a: "Yes. Add dependants in the Family section and switch between profiles to manage their appointments, prescriptions and records." },
              { q: "How do prescriptions reach the pharmacy?", a: "When your doctor issues a prescription it appears in your Prescriptions tab. From there you can send it to a pharmacy and order medicines." },
              { q: "Is my medical data shared without consent?", a: "No. Doctors, pharmacies and labs only see the minimum information necessary, and you can review and revoke access grants at any time." },
              { q: "How are medicines delivered?", a: "Once your pharmacy order is ready, a logistics rider is assigned. They confirm pickup, travel to your address, and complete delivery using a verification code." },
            ].map((f, i) => (
              <AccordionItem key={i} value={`q-${i}`}>
                <AccordionTrigger className="text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
