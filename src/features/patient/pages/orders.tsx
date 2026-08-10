"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder, PharmacyOrderStatus } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { Package, Search } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

const ACTIVE: PharmacyOrderStatus[] = ["paid", "prescription_under_review", "clarification_required", "accepted", "partially_available", "preparing", "ready_for_pickup", "picked_up", "in_transit"];
const DELIVERED: PharmacyOrderStatus[] = ["delivered"];

type OrderTab = "active" | "delivered" | "all";

export function PatientOrders() {
  const { profile } = usePatientContext();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrderTab>("active");

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

  const counts = useMemo(() => ({
    active: orders.filter((o) => ACTIVE.includes(o.status)).length,
    delivered: orders.filter((o) => DELIVERED.includes(o.status)).length,
    all: orders.length,
  }), [orders]);

  const rows = filtered.filter((o) =>
    tab === "all" ? true : tab === "active" ? ACTIVE.includes(o.status) : DELIVERED.includes(o.status)
  );

  return (
    <div className="space-y-4">
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

      <SegmentedControl<OrderTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active", badge: counts.active || undefined },
          { value: "delivered", label: "Delivered", badge: counts.delivered || undefined },
          { value: "all", label: "All" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load orders" description={error} />
      ) : rows.length === 0 ? (
        orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No pharmacy orders"
            description="Place an order from your prescriptions page."
            action={<Button onClick={() => navigate("patient", "prescriptions")}>View prescriptions</Button>}
          />
        ) : (
          <EmptyState
            icon={Package}
            title={search ? "No matches" : `No ${tab} orders`}
            description={search ? "Try a different search term." : "Switch tabs to see other orders."}
            compact
          />
        )
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {rows.map((o) => (
            <CompactListItem
              key={o.id}
              leading={
                <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100">
                  <Package className="h-4 w-4 text-amber-600" />
                </div>
              }
              title={o.orderNumber}
              subtitle={`${o.pharmacy?.name ?? "Pharmacy"} · ${o.items?.length ?? 0} item(s) · ${formatDate(createdAt(o) ?? o.orderNumber)}`}
              trailing={
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold">{formatCurrency(o.total)}</span>
                  <StatusBadge status={o.status} size="sm" />
                </div>
              }
              onClick={() => navigate("patient", "order", { id: o.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
