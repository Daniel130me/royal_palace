"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { deliveryService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Truck, Search, CheckCircle2, Wallet, Package, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "in_transit" | "delivered" | "failed";

const IN_TRANSIT_STATUSES = ["assigned", "accepted", "heading_to_pickup", "arrived_at_pickup", "pickup_verified", "picked_up", "in_transit", "arrived_at_destination"];
const FAILED_STATUSES = ["failed", "returned", "cancelled"];

export function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = () => {
    setLoading(true);
    setError(null);
    deliveryService.list()
      .then(setDeliveries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load deliveries"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: deliveries.length,
    in_transit: deliveries.filter((d) => IN_TRANSIT_STATUSES.includes(d.status)).length,
    delivered: deliveries.filter((d) => d.status === "delivered").length,
    failed: deliveries.filter((d) => FAILED_STATUSES.includes(d.status)).length,
  }), [deliveries]);

  const totalPayout = deliveries.reduce((s, d) => s + d.payout, 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries
      .filter((d) => {
        if (filter === "in_transit" && !IN_TRANSIT_STATUSES.includes(d.status)) return false;
        if (filter === "delivered" && d.status !== "delivered") return false;
        if (filter === "failed" && !FAILED_STATUSES.includes(d.status)) return false;
        if (!q) return true;
        const provName = d.logisticsProvider?.name ?? "";
        return `${d.deliveryNumber} ${d.orderId} ${d.logisticsProviderId} ${provName} ${d.recipientName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.deliveryNumber.localeCompare(a.deliveryNumber));
  }, [deliveries, search, filter]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deliveries"
        description="Read-only overview of every delivery across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Deliveries" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total" value={counts.all} icon={Truck} />
        <StatTile label="In transit" value={counts.in_transit} icon={Package} tone="info" />
        <StatTile label="Delivered" value={counts.delivered} icon={CheckCircle2} tone="success" />
        <StatTile label="Total payout" value={formatCurrency(totalPayout)} icon={Wallet} tone="success" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Delivery no, order, courier, recipient…" className="pl-9" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "in_transit" as StatusFilter, label: "In transit", badge: counts.in_transit },
          { value: "delivered" as StatusFilter, label: "Delivered", badge: counts.delivered },
          { value: "failed" as StatusFilter, label: "Failed", badge: counts.failed },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState icon={Truck} title="No deliveries" description="No deliveries match your filters." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((d) => (
            <CompactListItem
              key={d.id}
              leading={
                <div className={cn("rounded-lg p-2 ring-1",
                  d.status === "delivered" ? "bg-emerald-50 ring-emerald-100" :
                  FAILED_STATUSES.includes(d.status) ? "bg-rose-50 ring-rose-100" :
                  "bg-sky-50 ring-sky-100"
                )}>
                  {d.status === "delivered"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : FAILED_STATUSES.includes(d.status)
                      ? <Truck className="h-4 w-4 text-rose-600" />
                      : <Clock className="h-4 w-4 text-sky-600" />}
                </div>
              }
              title={`${d.deliveryNumber} · ${d.logisticsProvider?.name ?? d.logisticsProviderId}`}
              subtitle={`${d.recipientName} · ${d.verificationCode}${d.createdAt ? ` · ${formatDate(d.createdAt)}` : ""}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(d.payout)}</span>
                  <StatusBadge status={d.status} size="sm" />
                </div>
              }
              onClick={undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
