"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, initials } from "@/lib/format";
import { ShoppingCart, Search, FileText, Package, CheckCircle2, Truck } from "lucide-react";

type StatusFilter = "to_accept" | "in_progress" | "ready" | "delivered" | "all";

const FILTER_GROUPS: { key: StatusFilter; label: string; statuses: string[] }[] = [
  { key: "to_accept", label: "To accept", statuses: ["paid", "prescription_under_review", "clarification_required"] },
  { key: "in_progress", label: "In progress", statuses: ["accepted", "partially_available", "preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready_for_pickup", "picked_up", "in_transit"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "all", label: "All", statuses: [] },
];

function statusIcon(status: string) {
  if (status === "delivered") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (["ready_for_pickup", "picked_up", "in_transit"].includes(status)) return <Truck className="h-4 w-4 text-sky-600" />;
  if (["paid", "prescription_under_review", "clarification_required"].includes(status)) return <ShoppingCart className="h-4 w-4 text-amber-600" />;
  return <Package className="h-4 w-4 text-sky-600" />;
}

function statusIconBg(status: string) {
  if (status === "delivered") return "bg-emerald-50 ring-emerald-100";
  if (["ready_for_pickup", "picked_up", "in_transit"].includes(status)) return "bg-sky-50 ring-sky-100";
  if (["paid", "prescription_under_review", "clarification_required"].includes(status)) return "bg-amber-50 ring-amber-100";
  return "bg-sky-50 ring-sky-100";
}

export function PharmacyOrders() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("to_accept");
  const [query, setQuery] = useState("");

  const load = () => {
    if (!pharmacyId) return;
    setError(null);
    pharmacyOrderService
      .list({ pharmacyId })
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    if (!pharmacyId) return;
    pharmacyOrderService
      .list({ pharmacyId })
      .then((list) => { if (!cancelled) setOrders(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load orders"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const g of FILTER_GROUPS) {
      if (g.key === "all") continue;
      map[g.key] = orders.filter((o) => g.statuses.includes(o.status)).length;
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    const group = FILTER_GROUPS.find((g) => g.key === filter);
    if (group && group.statuses.length > 0) {
      list = list.filter((o) => group.statuses.includes(o.status));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.patient?.firstName.toLowerCase().includes(q) ||
          o.patient?.lastName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filter, query]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy orders"
        description="Progress orders through fulfilment."
        actions={
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by order no. or patient…"
          className="pl-9"
        />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={FILTER_GROUPS.map((g) => ({ value: g.key, label: g.label, badge: counts[g.key] ?? 0 }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={query ? "No matching orders" : "No orders here yet"}
          description={query ? "Try a different search term." : "Orders in this status will appear here."}
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((o) => (
            <CompactListItem
              key={o.id}
              leading={
                <div className={`rounded-lg p-2 ring-1 ${statusIconBg(o.status)}`}>
                  {statusIcon(o.status)}
                </div>
              }
              title={o.orderNumber}
              subtitle={`${o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · ${formatCurrency(o.total)} · ${formatDate(o.createdAt)}`}
              trailing={
                <div className="flex items-center gap-1.5">
                  {o.prescriptionId && (
                    <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                      <FileText className="h-2.5 w-2.5" /> Rx
                    </Badge>
                  )}
                  <StatusBadge status={o.status} size="sm" />
                </div>
              }
              onClick={() => navigate("pharmacy", "order", { id: o.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
