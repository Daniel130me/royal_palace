"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { resource } from "@/lib/api-client";
import type { Payment, PharmacyOrder, Settlement, Delivery, LaboratoryBooking } from "@/types";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CreditCard, Search, TrendingUp, Wallet, Truck, FlaskConical, Pill, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "successful" | "pending" | "refunded" | "all";

export function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [labBookings, setLabBookings] = useState<LaboratoryBooking[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      resource.list<Payment>("payment"),
      resource.list<PharmacyOrder>("pharmacyOrder"),
      resource.list<Delivery>("delivery"),
      resource.list<LaboratoryBooking>("laboratoryBooking"),
      resource.list<Settlement>("settlement"),
    ])
      .then(([pay, ord, del, lab, stl]) => {
        setPayments(pay);
        setOrders(ord);
        setDeliveries(del);
        setLabBookings(lab);
        setSettlements(stl);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const grossPayments = useMemo(
    () => payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const refundsTotal = useMemo(
    () => payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const pharmacyCommission = useMemo(
    () => orders.reduce((s, o) => s + o.commissionTotal, 0),
    [orders]
  );
  const labPayout = useMemo(
    () => labBookings.reduce((s, b) => s + b.price, 0),
    [labBookings]
  );
  const logisticsPayout = useMemo(
    () => deliveries.reduce((s, d) => s + d.payout, 0),
    [deliveries]
  );
  const providerPayout = useMemo(
    () => settlements.filter((s) => s.entityType === "provider").reduce((s, x) => s + x.netAmount, 0),
    [settlements]
  );
  const platformRevenue = useMemo(
    () => settlements.reduce((s, x) => s + x.commissionAmount, 0),
    [settlements]
  );

  const counts = useMemo(() => ({
    all: payments.length,
    successful: payments.filter((p) => p.status === "successful").length,
    pending: payments.filter((p) => p.status === "pending").length,
    refunded: payments.filter((p) => p.status === "refunded").length,
  }), [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...payments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((p) => {
        if (filter !== "all" && p.status !== filter) return false;
        if (!q) return true;
        return `${p.paymentNumber} ${p.patientId} ${p.reference ?? ""} ${p.method}`.toLowerCase().includes(q);
      });
  }, [payments, search, filter]);

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
        title="Payments"
        description="All patient payments on the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Payments" }]}
      />

      {/* StatTiles summary */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Payments" value={formatCurrency(grossPayments)} icon={TrendingUp} tone="success" />
        <StatTile label="Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" />
        <StatTile label="Providers" value={formatCurrency(providerPayout)} icon={Wallet} tone="info" />
        <StatTile label="Pharmacy" value={formatCurrency(pharmacyCommission)} icon={Pill} tone="info" />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Lab payouts" value={formatCurrency(labPayout)} icon={FlaskConical} tone="violet" />
        <StatTile label="Logistics" value={formatCurrency(logisticsPayout)} icon={Truck} tone="info" />
        <StatTile label="Refunds" value={formatCurrency(refundsTotal)} icon={RefreshCcw} tone={refundsTotal > 0 ? "danger" : "default"} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment no., patient, reference…" className="pl-9" />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "successful" as StatusFilter, label: "Successful", badge: counts.successful },
          { value: "pending" as StatusFilter, label: "Pending", badge: counts.pending },
          { value: "refunded" as StatusFilter, label: "Refunded", badge: counts.refunded },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" description="Try adjusting the filter or search." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((p) => (
            <CompactListItem
              key={p.id}
              leading={
                <div className={cn("rounded-lg p-2 ring-1",
                  p.status === "successful" ? "bg-emerald-50 ring-emerald-100" :
                  p.status === "refunded" ? "bg-rose-50 ring-rose-100" :
                  "bg-amber-50 ring-amber-100"
                )}>
                  <CreditCard className={cn("h-4 w-4",
                    p.status === "successful" ? "text-emerald-600" :
                    p.status === "refunded" ? "text-rose-600" :
                    "text-amber-600"
                  )} />
                </div>
              }
              title={p.paymentNumber}
              subtitle={`${p.method} · ${p.patientId} · ${formatDateTime(p.createdAt)}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                  <StatusBadge status={p.status} size="sm" />
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
