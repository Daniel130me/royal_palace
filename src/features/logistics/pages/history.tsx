"use client";

import { useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import type { Delivery, DeliveryStatus } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDateTime, formatDate } from "../delivery-helpers";
import {
  History as HistoryIcon, Search, ArrowRight, CheckCircle2,
  XCircle, RotateCcw, Ban, Wallet,
} from "lucide-react";

type Filter = "all" | "delivered" | "failed" | "returned" | "cancelled";

const FILTERS: { value: Filter; label: string; statuses: DeliveryStatus[] }[] = [
  { value: "all", label: "All", statuses: ["delivered", "failed", "returned", "cancelled"] },
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
  delivered: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  returned: "bg-amber-100 text-amber-700",
  cancelled: "bg-muted text-muted-foreground",
};

export function LogisticsHistory() {
  const { view } = useNav();
  const { deliveries, loading, error, refresh, completed } = useLogisticsContext();
  const filter: Filter = (view.params.tab as Filter) ?? "all";
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

  const totalEarnings = completed
    .filter((d) => d.status === "delivered")
    .reduce((acc, d) => acc + (d.payout || 0), 0);

  if (loading && deliveries.length === 0 && !error) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery history"
        description="All completed, failed, returned, and cancelled deliveries assigned to your account."
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "earnings")}>
            View earnings <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total completed" value={completed.filter((d) => d.status === "delivered").length} icon={CheckCircle2} tone="success" />
        <MetricCard label="Failed" value={completed.filter((d) => d.status === "failed").length} icon={XCircle} tone="danger" />
        <MetricCard label="Returned" value={completed.filter((d) => d.status === "returned").length} icon={RotateCcw} tone="warning" />
        <MetricCard label="Lifetime earnings" value={formatCurrency(totalEarnings)} icon={Wallet} tone="success" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by delivery number, recipient, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => { navigate("logistics", "history", { tab: v }); }}
      >
        <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md">
          <TabsList className="w-full sm:w-auto overflow-x-auto flex-wrap h-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="flex-1 sm:flex-initial">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

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
              <Button onClick={() => navigate("logistics", "assignments")}>
                Go to assignments
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {sorted.map((d) => {
                const Icon = STATUS_ICON[d.status] ?? HistoryIcon;
                const toneCls = STATUS_TONE[d.status] ?? "bg-muted text-muted-foreground";
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => navigate("logistics", "delivery", { id: d.id })}
                      className="w-full text-left flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors tap-highlight-none"
                    >
                      <div className={`rounded-xl p-2 shrink-0 ${toneCls}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{d.deliveryNumber}</p>
                          <StatusBadge status={d.status} size="sm" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {d.recipientName} · {d.deliveryLocation}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {d.updatedAt ? formatDate(d.updatedAt) : "—"}
                          {d.updatedAt && ` · ${formatDateTime(d.updatedAt).split(", ").pop()}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Payout</p>
                        <p className={`font-semibold tabular-nums ${d.status === "delivered" ? "text-emerald-700" : "text-muted-foreground line-through"}`}>
                          {formatCurrency(d.payout)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
