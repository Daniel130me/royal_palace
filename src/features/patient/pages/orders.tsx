"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder, PharmacyOrderStatus } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    let cancelled = false;
    setLoading(true);
    pharmacyOrderService.list({ patientId: profile.id })
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load orders"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    <div className="space-y-5">
      <PageHeader title="Pharmacy Orders" description="Track your medicine orders and deliveries." />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order or pharmacy…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load orders" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No pharmacy orders"
          description="Place an order from your prescriptions page."
          action={<Button onClick={() => navigate("patient", "prescriptions")}>View prescriptions</Button>}
        />
      ) : (
        <Tabs defaultValue="active">
          <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur-md">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
              <TabsTrigger value="delivered">Delivered ({counts.delivered})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({counts.cancelled})</TabsTrigger>
            </TabsList>
          </div>

          {(["active", "delivered", "cancelled"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {filtered
                .filter((o) => tab === "active" ? ACTIVE.includes(o.status) : tab === "delivered" ? DELIVERED.includes(o.status) : CANCELLED.includes(o.status))
                .map((o) => (
                  <Card key={o.id} className="hover:shadow-soft-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-amber-50 p-2 ring-1 ring-amber-100 shrink-0">
                          <Package className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">{o.orderNumber}</p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{o.pharmacy?.name} · {formatDate(createdAt(o) ?? o.orderNumber)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{o.items?.length ?? 0} item(s) · <span className="font-medium text-foreground">{formatCurrency(o.total)}</span></p>
                            </div>
                            <StatusBadge status={o.status} size="sm" />
                          </div>
                          <div className="mt-3">
                            <Button size="sm" variant="outline" onClick={() => navigate("patient", "order", { id: o.id })}>
                              View details <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
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
