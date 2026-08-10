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
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDateTime, formatDate } from "../delivery-helpers";
import {
  History as HistoryIcon, Search, ArrowRight, CheckCircle2,
  XCircle, RotateCcw, Ban,
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
    return <LoadingState label="Loading delivery history…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div>
      <PageHeader
        title="Delivery history"
        description="All completed, failed, returned, and cancelled deliveries assigned to your account."
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "earnings")}>
            View earnings <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryTile label="Total completed" value={completed.filter((d) => d.status === "delivered").length.toString()} />
        <SummaryTile label="Failed" value={completed.filter((d) => d.status === "failed").length.toString()} tone="danger" />
        <SummaryTile label="Returned" value={completed.filter((d) => d.status === "returned").length.toString()} tone="warning" />
        <SummaryTile label="Lifetime earnings" value={formatCurrency(totalEarnings)} tone="success" />
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => {
          navigate("logistics", "history", { tab: v });
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="flex-1 sm:flex-initial">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by number, recipient, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

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
              <div className="divide-y">
                {sorted.map((d) => {
                  const Icon = STATUS_ICON[d.status] ?? HistoryIcon;
                  return (
                    <button
                      key={d.id}
                      onClick={() => navigate("logistics", "delivery", { id: d.id })}
                      className="w-full text-left flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className={`rounded-lg p-2 shrink-0 ${
                        d.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                        d.status === "failed" ? "bg-rose-100 text-rose-700" :
                        d.status === "returned" ? "bg-amber-100 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{d.deliveryNumber}</p>
                          <StatusBadge status={d.status} />
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
                        <p className="text-[10px] text-muted-foreground uppercase">Payout</p>
                        <p className={`font-semibold ${d.status === "delivered" ? "text-emerald-700" : "text-muted-foreground line-through"}`}>
                          {formatCurrency(d.payout)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success" ? "text-emerald-700" :
    tone === "warning" ? "text-amber-700" :
    tone === "danger" ? "text-rose-700" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold mt-1 ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
