"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder, PharmacyOrderStatus } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, ChevronRight, Search } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

const ACTIVE: PharmacyOrderStatus[] = ["paid", "prescription_under_review", "clarification_required", "accepted", "partially_available", "preparing", "ready_for_pickup", "picked_up", "in_transit"];
const DELIVERED: PharmacyOrderStatus[] = ["delivered"];
const CANCELLED: PharmacyOrderStatus[] = ["cancelled", "rejected", "refunded"];

export function PatientOrders() {
  const { profile } = usePatientContext();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    pharmacyOrderService.list({ patientId: profile.id })
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => !search.trim() || o.orderNumber.toLowerCase().includes(search.toLowerCase()) || (o.pharmacy?.name ?? "").toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(createdAt(b) ?? b.orderNumber).getTime() - new Date(createdAt(a) ?? a.orderNumber).getTime());
  }, [orders, search]);

  const counts = {
    active: filtered.filter((o) => ACTIVE.includes(o.status)).length,
    delivered: filtered.filter((o) => DELIVERED.includes(o.status)).length,
    cancelled: filtered.filter((o) => CANCELLED.includes(o.status)).length,
  };

  return (
    <div>
      <PageHeader title="Pharmacy Orders" description="Track your medicine orders and deliveries." />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order or pharmacy…"
          className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <LoadingState label="Loading orders…" />
      ) : error ? (
        <EmptyState title="Could not load orders" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No pharmacy orders"
          description="Place an order from your prescriptions page."
          action={<Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "prescriptions")}>View prescriptions</Button>}
        />
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
            <TabsTrigger value="delivered">Delivered ({counts.delivered})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled ({counts.cancelled})</TabsTrigger>
          </TabsList>

          {(["active", "delivered", "cancelled"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {filtered
                .filter((o) => tab === "active" ? ACTIVE.includes(o.status) : tab === "delivered" ? DELIVERED.includes(o.status) : CANCELLED.includes(o.status))
                .map((o) => (
                  <Card key={o.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-amber-50 p-2 shrink-0">
                        <Package className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{o.pharmacy?.name} · {formatDate(createdAt(o) ?? o.orderNumber)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{o.items?.length ?? 0} item(s) · {formatCurrency(o.total)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={o.status} />
                        <Button size="sm" variant="outline" onClick={() => navigate("patient", "order", { id: o.id })}>
                          View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              }
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
