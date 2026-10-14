"use client";

import { useMemo, useState } from "react";
import { useLabContext } from "../use-lab-context";
import {
  PageHeader,
  EmptyState,
  ErrorState,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatMinorCurrency } from "@/lib/format";
import { ListChecks, Lock, CheckCircle2, Tag, FlaskConical, Wallet } from "lucide-react";

type FilterKey = "all" | "active" | "inactive";

export function LabServices() {
  const { workspace, loading, error, reload } = useLabContext();
  const [filter, setFilter] = useState<FilterKey>("all");
  const services = workspace?.services ?? [];

  const activeCount = useMemo(
    () => services.filter((service) => service.status === "ACTIVE").length,
    [services],
  );
  const inactiveCount = services.length - activeCount;
  const averagePayout = useMemo(() => {
    const configured = services.flatMap((service) =>
      service.pricing === null ? [] : [service.pricing],
    );
    if (configured.length === 0) return null;
    const currency = configured[0]?.currency;
    if (currency === undefined || configured.some((price) => price.currency !== currency))
      return null;
    const total = configured.reduce(
      (sum, price) => sum + BigInt(price.laboratoryPayoutMinor),
      BigInt(0),
    );
    return { amountMinor: (total / BigInt(configured.length)).toString(), currency };
  }, [services]);

  const visible = useMemo(() => {
    if (filter === "active") return services.filter((service) => service.status === "ACTIVE");
    if (filter === "inactive") return services.filter((service) => service.status !== "ACTIVE");
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
            Patient prices and lab payouts are centrally defined. Contact your account manager to
            request a review.
          </p>
        </div>
      </div>

      {/* StatTiles row */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Services" value={services.length} icon={ListChecks} tone="info" />
        <StatTile label="Active" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatTile
          label="Avg payout"
          value={
            averagePayout === null
              ? "Not configured"
              : formatMinorCurrency(averagePayout.amountMinor, averagePayout.currency)
          }
          icon={Wallet}
          tone="success"
        />
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
          {visible.map((service) => {
            const active = service.status === "ACTIVE";
            const price = service.pricing;
            return (
              <CompactListItem
                key={service.id}
                leading={
                  <div
                    className={
                      active
                        ? "rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"
                        : "rounded-lg bg-muted p-2 ring-1 ring-border"
                    }
                  >
                    {active ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <FlaskConical className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                }
                title={service.name}
                subtitle={
                  price
                    ? `${formatMinorCurrency(price.patientPriceMinor, price.currency)} patient · ${formatMinorCurrency(price.laboratoryPayoutMinor, price.currency)} payout`
                    : "No active price"
                }
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={active ? "active" : "inactive"} size="sm" />
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
