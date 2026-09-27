"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabContext } from "../use-lab-context";
import { serviceService } from "@/lib/services";
import type { Service } from "@/types";
import {
  PageHeader, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency } from "@/lib/format";
import { ListChecks, Lock, CheckCircle2, Tag, FlaskConical, Activity, Wallet } from "lucide-react";

type FilterKey = "all" | "active" | "inactive";

export function LabServices() {
  const { reload } = useLabContext();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    setLoading(true);
    serviceService
      .byCategory("laboratory")
      .then(setServices)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load services."))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = useMemo(() => services.filter((s) => s.active).length, [services]);
  const inactiveCount = services.length - activeCount;
  const avgPayout = useMemo(() => {
    const items = services.map((s) => s.prices?.[0]?.providerPayout ?? 0);
    return items.length ? items.reduce((a, b) => a + b, 0) / items.length : 0;
  }, [services]);

  const visible = useMemo(() => {
    if (filter === "active") return services.filter((s) => s.active);
    if (filter === "inactive") return services.filter((s) => !s.active);
    return services;
  }, [services, filter]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Service catalogue"
        description="Lab tests available on Royal Palace with centrally-set pricing."
      />

      {/* Compact pricing notice */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 flex items-start gap-2.5">
        <div className="rounded-lg bg-sky-100 p-1.5 shrink-0">
          <Lock className="h-4 w-4 text-sky-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-sky-800">Pricing is set by Royal Palace</p>
          <p className="text-xs text-sky-700 mt-0.5 leading-relaxed">
            Patient prices and lab payouts are centrally defined. Contact your account manager to request a review.
          </p>
        </div>
      </div>

      {/* StatTiles row */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Services" value={services.length} icon={ListChecks} tone="info" />
        <StatTile label="Active" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatTile label="Avg payout" value={formatCurrency(avgPayout)} icon={Wallet} tone="success" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as FilterKey, label: "All", badge: services.length },
          { value: "active" as FilterKey, label: "Active", badge: activeCount },
          { value: "inactive" as FilterKey, label: "Inactive", badge: inactiveCount },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No laboratory services"
          description="No services match this filter."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((s) => {
            const price = s.prices?.[0];
            return (
              <CompactListItem
                key={s.id}
                leading={
                  <div className={s.active ? "rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100" : "rounded-lg bg-muted p-2 ring-1 ring-border"}>
                    {s.active
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <FlaskConical className="h-4 w-4 text-muted-foreground" />}
                  </div>
                }
                title={s.name}
                subtitle={price
                  ? `${formatCurrency(price.patientPrice)} patient · ${formatCurrency(price.providerPayout)} payout`
                  : "No active price"}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={s.active ? "active" : "draft"} size="sm" />
                  </div>
                }
                onClick={undefined}
              />
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Tag className="h-3 w-3" />
        <span>All prices are managed centrally by Royal Palace administrators.</span>
      </div>
    </div>
  );
}
