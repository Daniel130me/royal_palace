"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { deliveryService, pharmacyOrderService } from "@/lib/services";
import type { Delivery, PharmacyOrder } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SkeletonGrid, EmptyState, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, ExpandableCard } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Truck, Search, MapPin, ShieldCheck, Package, Hash,
  CheckCircle2, AlertTriangle, XCircle, Ban, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "delivered" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed / returned" },
];

function statusTone(status: string) {
  if (status === "delivered") return { bg: "bg-emerald-50 ring-emerald-100", icon: CheckCircle2, color: "text-emerald-600" };
  if (["failed", "returned", "cancelled"].includes(status)) return { bg: "bg-rose-50 ring-rose-100", icon: XCircle, color: "text-rose-600" };
  if (status === "in_transit") return { bg: "bg-violet-50 ring-violet-100", icon: Truck, color: "text-violet-600" };
  if (status === "picked_up") return { bg: "bg-sky-50 ring-sky-100", icon: Package, color: "text-sky-600" };
  return { bg: "bg-amber-50 ring-amber-100", icon: Truck, color: "text-amber-600" };
}

export function PharmacyDeliveries() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = () => {
    if (!pharmacyId) return;
    setError(null);
    Promise.all([
      deliveryService.list().catch(() => [] as Delivery[]),
      pharmacyOrderService.list({ pharmacyId }).catch(() => [] as PharmacyOrder[]),
    ])
      .then(([d, o]) => {
        setDeliveries(d);
        setOrders(o);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load deliveries"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    Promise.all([
      deliveryService.list().catch(() => [] as Delivery[]),
      pharmacyOrderService.list({ pharmacyId }).catch(() => [] as PharmacyOrder[]),
    ])
      .then(([d, o]) => {
        if (cancelled) return;
        setDeliveries(d);
        setOrders(o);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deliveries"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const pharmacyOrderIds = useMemo(() => new Set(orders.map((o) => o.id)), [orders]);
  const mine = useMemo(
    () => deliveries.filter((d) => d.orderId && pharmacyOrderIds.has(d.orderId)),
    [deliveries, pharmacyOrderIds]
  );

  const counts = useMemo(() => ({
    all: mine.length,
    active: mine.filter((d) => !["delivered", "failed", "returned", "cancelled"].includes(d.status)).length,
    delivered: mine.filter((d) => d.status === "delivered").length,
    failed: mine.filter((d) => ["failed", "returned", "cancelled"].includes(d.status)).length,
  }), [mine]);

  const filtered = useMemo(() => {
    let list = mine;
    if (filter === "active") {
      list = list.filter((d) => !["delivered", "failed", "returned", "cancelled"].includes(d.status));
    } else if (filter === "delivered") {
      list = list.filter((d) => d.status === "delivered");
    } else if (filter === "failed") {
      list = list.filter((d) => ["failed", "returned", "cancelled"].includes(d.status));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (d) =>
          d.deliveryNumber.toLowerCase().includes(q) ||
          d.recipientName.toLowerCase().includes(q) ||
          d.deliveryLocation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [mine, filter, query]);

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
        title="Deliveries"
        description="Track deliveries linked to your pharmacy orders. Logistics owns delivery progression."
      />

      <Alert className="border-sky-200 bg-sky-50">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <AlertTitle className="text-sky-800">Read-only view</AlertTitle>
        <AlertDescription className="text-sky-700">
          Once an order is ready for pickup, the assigned logistics provider manages pickup,
          transit and delivery. You can track progress here but cannot progress delivery status.
        </AlertDescription>
      </Alert>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by delivery no., recipient or address…"
          className="pl-9"
        />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, badge: counts[f.value] }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={query ? "No matching deliveries" : "No deliveries here yet"}
          description={query ? "Try a different search." : "Deliveries linked to your orders will appear here once they are ready for pickup."}
          compact
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const order = orders.find((o) => o.id === d.orderId);
            const tone = statusTone(d.status);
            const Icon = tone.icon;
            const isFailed = ["failed", "returned", "cancelled"].includes(d.status);
            return (
              <ExpandableCard
                key={d.id}
                leading={
                  <div className={cn("rounded-lg p-2 ring-1", tone.bg)}>
                    <Icon className={cn("h-4 w-4", tone.color)} />
                  </div>
                }
                title={d.deliveryNumber}
                subtitle={`${d.recipientName} · ${d.deliveryLocation}`}
                trailing={
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-xs font-bold">{d.verificationCode}</span>
                    </div>
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                }
              >
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Pickup
                      </p>
                      <p className="text-xs font-medium mt-0.5 truncate">{d.pickupLocation}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Drop-off
                      </p>
                      <p className="text-xs font-medium mt-0.5 truncate">{d.deliveryLocation}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Rider: <span className="font-medium text-foreground">{d.logisticsProvider?.name ?? "—"}</span></span>
                    {d.updatedAt && (
                      <>
                        <span>·</span>
                        <span>Updated {formatDate(d.updatedAt)}</span>
                      </>
                    )}
                  </div>
                  {d.handlingInstruction && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs italic text-amber-900 leading-relaxed">{d.handlingInstruction}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                    {order && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                        <Package className="h-2.5 w-2.5" /> {order.orderNumber}
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="outline" className="text-[10px] h-5 border-rose-200 bg-rose-50 text-rose-700">
                        Read-only
                      </Badge>
                    )}
                    <button
                      className="ml-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline tap-highlight-none"
                      onClick={() => order && navigate("pharmacy", "order", { id: order.id })}
                    >
                      View order <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
