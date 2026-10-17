"use client";

import type { PublicSupportConfigResponse } from "@royal-palace/contracts";
import { LifeBuoy, Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { publicDiscoveryService } from "@/lib/services";

const FAQS = [
  {
    question: "How do I book a consultation?",
    answer:
      "Sign in as a patient, open Find Care, choose a verified practitioner and select one of their published appointment slots. The payable amount is shown before checkout.",
  },
  {
    question: "How do prescriptions reach a pharmacy?",
    answer:
      "An eligible prescription can be routed to a verified pharmacy. The pharmacy reviews it, prepares an exact quote and asks for your approval before an order or payment is created.",
  },
  {
    question: "How do laboratory bookings and results work?",
    answer:
      "Eligible requests can be booked with a verified laboratory. Published results and clean attachments are available only to authorized participants in the care journey.",
  },
  {
    question: "Is clinical information included in external messages?",
    answer:
      "No. External notifications contain only the minimum operational information needed to direct a verified recipient back to the secure platform.",
  },
  {
    question: "When is delivery available?",
    answer:
      "Delivery is offered only when the selected organization, order, destination and qualified logistics workflow support it. Eligibility is confirmed inside the order flow.",
  },
] as const;

export function PublicHelp() {
  const [config, setConfig] = useState<PublicSupportConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    publicDiscoveryService
      .supportConfig(controller.signal)
      .then(setConfig)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error ? requestError.message : "Support contacts unavailable",
        );
      });
    return () => controller.abort();
  }, [reloadToken]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Help & support"
        description="Find answers and qualified support channels."
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5 text-center">
            <LifeBuoy className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">Support availability</p>
            <p className="text-xs text-muted-foreground">
              {config?.availability ?? "Hours are published for each deployment"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <Mail className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">Email</p>
            {config?.email ? (
              <a
                className="text-xs text-emerald-700 hover:underline"
                href={`mailto:${config.email}`}
              >
                {config.email}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Not published for this environment</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <Phone className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">Hotline</p>
            {config?.phoneE164 ? (
              <a
                className="text-xs text-emerald-700 hover:underline"
                href={`tel:${config.phoneE164}`}
              >
                {config.phoneE164}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Not published for this environment</p>
            )}
          </CardContent>
        </Card>
      </div>
      {error ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>Support contact details could not be loaded. No fallback address is being guessed.</p>
          <Button className="mt-3" onClick={retry} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : null}
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">Common questions</h2>
          <Accordion collapsible type="single">
            {FAQS.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="text-sm">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
