"use client";

import { useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import type { Delivery, DeliveryStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, formatDateTime } from "../delivery-helpers";
import {
  History as HistoryIcon, Search, ArrowRight, CheckCircle2,
  XCircle, RotateCcw, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "delivered" | "failed" | "returned" | "cancelled";

const FILTERS: { value: Filter; label: string; statuses: DeliveryStatus[] }[] = [
  { value: "delivered", label: "Delivered", statuses: ["delivered"] },
  { value: "failed", label: "Failed", statuses: ["failed"] },
  { value: "returned", label: "Returned", statuses: ["returned"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

const STATUS_ICON: Partial<Record<DeliveryStatus, React.ComponentType<{ className?: string }>>> = {
  delivered: CheckCircle2,
  failed: XCircle,
  returned: RotateCcw,
  cancelled: Ban,
};

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-50 ring-emerald-100 text-emerald-600",
  failed: "bg-rose-50 ring-rose-100 text-rose-600",
  returned: "bg-amber-50 ring-amber-100 text-amber-600",
  cancelled: "bg-muted ring-border text-muted-foreground",
};

export function LogisticsHistory() {
  const { view } = useNav();
  const { deliveries, loading, error, refresh, completed } = useLogisticsContext();
  const filter: Filter = (view.params.tab as Filter) ?? "delivered";
  const [search, setSearch] = useState("");

  const list = useMemo<Delivery[]>(() => {
    const cfg = FILTERS.find((f) => f.value === filter) ?? FILTERS[0];
    const base = completed.filter((d) => cfg.statuses.includes(d.status));
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (d) =>
        d.deliveryNumber.toLowerCase().includes(q) ||
        d.deliveryLocation.toLowerCase().includes(q) ||
        d.recipientName.toLowerCase().includes(q)
    );
  }, [filter, search, completed]);

  const sorted = useMemo(() => {
    const copy = [...list];
    copy.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return copy;
  }, [list]);

  const counts = useMemo(() => ({
    delivered: completed.filter((d) => d.status === "delivered").length,
    failed: completed.filter((d) => d.status === "failed").length,
    returned: completed.filter((d) => d.status === "returned").length,
    cancelled: completed.filter((d) => d.status === "cancelled").length,
  }), [completed]);

  if (loading && deliveries.length === 0 && !error) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery history"
        description="All completed, failed, returned, and cancelled deliveries."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("logistics", "earnings")} className="hidden lg:inline-flex">
            View earnings <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by delivery no., recipient, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, badge: counts[f.value] }))}
        value={filter}
        onChange={(v) => navigate("logistics", "history", { tab: v })}
        size="sm"
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No deliveries in history"
          description={
            search.trim()
              ? "No deliveries match your search."
              : "Once you complete deliveries, they will appear here as a permanent record."
          }
          action={
            !search.trim() ? (
              <Button size="sm" onClick={() => navigate("logistics", "assignments")}>
                Go to assignments
              </Button>
            ) : undefined
          }
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {sorted.map((d) => {
            const Icon = STATUS_ICON[d.status] ?? HistoryIcon;
            const toneCls = STATUS_TONE[d.status] ?? "bg-muted ring-border text-muted-foreground";
            return (
              <CompactListItem
                key={d.id}
                leading={
                  <div className={cn("rounded-lg p-2 ring-1", toneCls)}>
                    <Icon className="h-4 w-4" />
                  </div>
                }
                title={d.deliveryNumber}
                subtitle={`${d.recipientName} · ${d.deliveryLocation}${d.updatedAt ? ` · ${formatDate(d.updatedAt)}` : ""}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("text-sm font-bold tabular-nums", d.status === "delivered" ? "text-emerald-700" : "text-muted-foreground line-through")}>
                      {formatCurrency(d.payout)}
                    </span>
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                }
                onClick={() => navigate("logistics", "delivery", { id: d.id })}
                chevron
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
