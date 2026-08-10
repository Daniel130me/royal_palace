"use client";

import { useEffect, useState } from "react";
import { serviceService } from "@/lib/services";
import type { Service } from "@/types";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingState } from "@/components/healthcare/page-header";

const CATEGORY_LABELS: Record<string, string> = {
  consultation: "Consultation",
  dental: "Dental",
  laboratory: "Laboratory",
  home: "Home Services",
  preventive: "Preventive Care",
  chronic: "Chronic Care",
  logistics: "Logistics",
  subscription: "Subscriptions",
};

export function PublicPricing() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    serviceService.list().then((s) => { setServices(s); setLoading(false); });
  }, []);

  const byCategory = services.reduce<Record<string, Service[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] ?? []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title="Transparent pricing" description="Platform-managed prices for consultations, laboratory, delivery and more." />
      {loading ? <LoadingState /> : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat}>
              <h2 className="font-semibold mb-3">{CATEGORY_LABELS[cat] ?? cat}</h2>
              <Card>
                <CardContent className="p-0 divide-y">
                  {list.map((s) => {
                    const price = s.prices?.[0];
                    return (
                      <div key={s.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                          <Badge variant="secondary" className="mt-1 text-[10px]">{price?.status ?? "active"}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{price ? formatCurrency(price.patientPrice) : "—"}</p>
                          {price && <p className="text-xs text-muted-foreground">Payout {formatCurrency(price.providerPayout)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
