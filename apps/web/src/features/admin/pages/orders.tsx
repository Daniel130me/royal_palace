"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Package, Search, Wallet, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "delivered" | "cancelled";

const ACTIVE_STATUSES = ["paid", "prescription_under_review", "accepted", "preparing", "ready_for_pickup", "picked_up", "in_transit"];

export function AdminOrders() {
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = () => {
    setLoading(true);
    setError(null);
    pharmacyOrderService.list()
      .then(setOrders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: orders.length,
    active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.filter((o) => ["cancelled", "refunded"].includes(o.status)).length,
  }), [orders]);

  const totalGMV = orders.reduce((s, o) => s + o.total, 0);
  const totalCommission = orders.reduce((s, o) => s + o.commissionTotal, 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (filter === "active" && !ACTIVE_STATUSES.includes(o.status)) return false;
        if (filter === "delivered" && o.status !== "delivered") return false;
        if (filter === "cancelled" && !["cancelled", "refunded"].includes(o.status)) return false;
        if (!q) return true;
        const pharmName = o.pharmacy?.name ?? "";
        return `${o.orderNumber} ${o.patientId} ${o.pharmacyId} ${pharmName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
  }, [orders, search, filter]);

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
        title="Pharmacy Orders"
        description="Read-only overview of every pharmacy order."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pharmacy Orders" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Orders" value={counts.all} icon={Package} />
        <StatTile label="GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} tone="success" />
        <StatTile label="Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="info" />
        <StatTile label="Delivered" value={counts.delivered} icon={CheckCircle2} tone="success" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, patient, pharmacy…" className="pl-9" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "active" as StatusFilter, label: "Active", badge: counts.active },
          { value: "delivered" as StatusFilter, label: "Delivered", badge: counts.delivered },
          { value: "cancelled" as StatusFilter, label: "Cancelled", badge: counts.cancelled },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState icon={Package} title="No orders" description="No pharmacy orders match your filters." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((o) => (
            <CompactListItem
              key={o.id}
              leading={
                <div className={cn("rounded-lg p-2 ring-1",
                  o.status === "delivered" ? "bg-emerald-50 ring-emerald-100" :
                  ["cancelled", "refunded"].includes(o.status) ? "bg-rose-50 ring-rose-100" :
                  "bg-amber-50 ring-amber-100"
                )}>
                  {o.status === "delivered"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : ["cancelled", "refunded"].includes(o.status)
                      ? <Package className="h-4 w-4 text-rose-600" />
                      : <Clock className="h-4 w-4 text-amber-600" />}
                </div>
              }
              title={`${o.orderNumber} · ${o.pharmacy?.name ?? o.pharmacyId}`}
              subtitle={`${o.patientId} · ${o.items?.length ?? 0} item(s)${o.createdAt ? ` · ${formatDate(o.createdAt)}` : ""}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(o.total)}</span>
                  <StatusBadge status={o.status} size="sm" />
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
