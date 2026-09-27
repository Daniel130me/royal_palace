"use client";

import { useEffect, useState } from "react";
import { serviceService } from "@/lib/services";
import type { Service } from "@/types";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { activeServicePrice } from "@/lib/pricing-policy";
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
      <PageHeader title="Service costs" description="See the total amount payable for consultations, laboratory services, delivery and more." />
      {loading ? <LoadingState /> : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat}>
              <h2 className="font-semibold mb-3">{CATEGORY_LABELS[cat] ?? cat}</h2>
              <Card>
                <CardContent className="p-0 divide-y">
                  {list.map((s) => {
                    const price = activeServicePrice(s);
                    return (
                      <div key={s.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Total payable</p>
                          <p className="font-semibold tabular-nums">{price ? formatCurrency(price.patientPrice) : "—"}</p>
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
