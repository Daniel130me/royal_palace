"use client";

import { useEffect, useState } from "react";
import { useLabContext } from "../use-lab-context";
import { serviceService } from "@/lib/services";
import type { Service } from "@/types";
import {
  PageHeader, SectionCard, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { ListChecks, Lock, CheckCircle2, Tag } from "lucide-react";

export function LabServices() {
  const { reload } = useLabContext();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    serviceService
      .byCategory("laboratory")
      .then(setServices)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load services."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratory service catalogue"
        description="Lab tests available on the Royal Palace platform with centrally-set pricing."
      />

      <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 flex items-start gap-3">
        <div className="rounded-xl bg-sky-100 p-2 shrink-0">
          <Lock className="h-5 w-5 text-sky-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sky-800">Pricing is set by Royal Palace</p>
          <p className="text-sm text-sky-700 mt-0.5 leading-relaxed">
            The platform defines patient prices and your lab payout for each test. To request a price review, contact your account manager.
          </p>
        </div>
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No laboratory services"
          description="No lab services are configured on the platform yet."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => {
            const price = s.prices?.[0];
            return (
              <Card key={s.id} className="hover:shadow-soft-md transition-shadow overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{s.id}</p>
                    </div>
                    <Badge variant={s.active ? "secondary" : "outline"} className="shrink-0">
                      {s.active ? (
                        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>
                      ) : (
                        "Inactive"
                      )}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.description}</p>
                  )}
                  <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Patient pays
                      </span>
                      <span className="font-semibold">{formatCurrency(price?.patientPrice ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Lab payout</span>
                      <span className="font-medium text-emerald-700">{formatCurrency(price?.providerPayout ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
                      <span>Platform margin</span>
                      <span>{formatCurrency(price?.platformMargin ?? 0)}</span>
                    </div>
                    {price?.effectiveFrom && (
                      <p className="text-xs text-muted-foreground">Effective from {formatDate(price.effectiveFrom)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
