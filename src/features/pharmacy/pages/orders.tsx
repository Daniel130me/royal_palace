"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, ORDER_STATUSES } from "@/lib/format";
import { ShoppingCart, Search, ArrowRight } from "lucide-react";

type StatusFilter = "all" | "active" | "completed" | string;

const FILTER_GROUPS: { key: StatusFilter; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "active", label: "Active", statuses: ["paid", "prescription_under_review", "clarification_required", "accepted", "partially_available", "preparing", "ready_for_pickup", "picked_up", "in_transit"] },
  { key: "completed", label: "Completed", statuses: ["delivered"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected", "cancelled", "refunded"] },
];

export function PharmacyOrders() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
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

  if (loading) return <LoadingState label="Loading orders…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Pharmacy orders"
        description="All orders placed at your pharmacy. Progress them through fulfilment."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Orders" }]}
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        }
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex flex-wrap rounded-lg border bg-background p-1">
          {FILTER_GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setFilter(g.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === g.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order no. or patient…"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={query ? "No matching orders" : "No orders yet"}
          description={query ? "Try a different search term." : "When patients place orders at your pharmacy they will appear here."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <Card key={o.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{o.orderNumber}</p>
                      <StatusBadge status={o.status} />
                      {o.prescriptionId && (
                        <span className="text-xs rounded bg-muted px-2 py-0.5">Rx linked</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Patient:{" "}
                      <span className="font-medium text-foreground">
                        {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"}
                      </span>
                      {" · "}
                      Total: <span className="font-medium text-foreground">{formatCurrency(o.total)}</span>
                      {" · "}
                      {o.items?.length ?? 0} item(s)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Placed {formatDate(o.createdAt)} · Commission {formatCurrency(o.commissionTotal)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => navigate("pharmacy", "order", { id: o.id })}>
                    Open <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
