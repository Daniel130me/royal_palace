"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { deliveryService, pharmacyOrderService } from "@/lib/services";
import type { Delivery, PharmacyOrder } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, formatDateTime } from "@/lib/format";
import { Truck, Search, ArrowRight, Package, MapPin, ShieldCheck } from "lucide-react";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Failed / returned" },
];

export function PharmacyDeliveries() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
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

  // Only deliveries linked to this pharmacy's orders
  const pharmacyOrderIds = useMemo(() => new Set(orders.map((o) => o.id)), [orders]);
  const mine = useMemo(
    () => deliveries.filter((d) => d.orderId && pharmacyOrderIds.has(d.orderId)),
    [deliveries, pharmacyOrderIds]
  );

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

  if (loading) return <LoadingState label="Loading deliveries…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Deliveries"
        description="Track deliveries linked to your pharmacy orders. Logistics owns delivery progression."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Deliveries" }]}
      />

      <Alert className="mb-4 border-sky-200 bg-sky-50">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <AlertTitle className="text-sky-800">Read-only view</AlertTitle>
        <AlertDescription className="text-sky-700">
          Once an order is ready for pickup, the assigned logistics provider manages pickup,
          transit and delivery. You can track progress here but cannot progress delivery status.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex flex-wrap rounded-lg border bg-background p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by delivery no., recipient or address…"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={query ? "No matching deliveries" : "No deliveries yet"}
          description={query ? "Try a different search." : "Deliveries linked to your orders will appear here once they are ready for pickup."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const order = orders.find((o) => o.id === d.orderId);
            return (
              <Card key={d.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{d.deliveryNumber}</p>
                        <StatusBadge status={d.status} />
                        {order && (
                          <button
                            className="text-xs text-sky-700 hover:underline"
                            onClick={() => navigate("pharmacy", "order", { id: order.id })}
                          >
                            {order.orderNumber}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Recipient: <span className="font-medium text-foreground">{d.recipientName}</span>
                        {" · "}Rider: {d.logisticsProvider?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {d.deliveryLocation}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pickup: {d.pickupLocation}
                      </p>
                      {d.handlingInstruction && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          {d.handlingInstruction}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="text-muted-foreground">Verification code</p>
                      <p className="font-mono font-bold text-base">{d.verificationCode}</p>
                    </div>
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

