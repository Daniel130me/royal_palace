"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Package, Search, Filter, Wallet, TrendingUp, CheckCircle2 } from "lucide-react";

const STATUS_OPTIONS = ["all", "paid", "prescription_under_review", "accepted", "preparing", "ready_for_pickup", "picked_up", "in_transit", "delivered", "cancelled", "refunded"];

export function AdminOrders() {
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = () => {
    setLoading(true);
    setError(null);
    pharmacyOrderService.list()
      .then(setOrders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (!q) return true;
        const pharmName = o.pharmacy?.name ?? "";
        return `${o.orderNumber} ${o.patientId} ${o.pharmacyId} ${pharmName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
  }, [orders, search, statusFilter]);

  const totalGMV = orders.reduce((s, o) => s + o.total, 0);
  const totalCommission = orders.reduce((s, o) => s + o.commissionTotal, 0);
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;

  if (loading) return <LoadingState label="Loading orders…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Pharmacy Orders"
        description="Read-only overview of every pharmacy order across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pharmacy Orders" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Orders" value={orders.length} icon={Package} />
        <MetricCard label="GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} tone="success" />
        <MetricCard label="Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="info" />
        <MetricCard label="Delivered" value={deliveredCount} icon={CheckCircle2} tone="success" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, patient, pharmacy…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No orders" description="No pharmacy orders match your filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Order</th>
                  <th className="text-left p-3">Patient</th>
                  <th className="text-left p-3">Pharmacy</th>
                  <th className="text-right p-3">Subtotal</th>
                  <th className="text-right p-3">Delivery</th>
                  <th className="text-right p-3">Commission</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <p className="font-medium">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{o.id}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{o.patientId}</td>
                    <td className="p-3">
                      {o.pharmacy ? <span className="truncate block">{o.pharmacy.name}</span> : <span className="text-muted-foreground">{o.pharmacyId}</span>}
                    </td>
                    <td className="p-3 text-right">{formatCurrency(o.subtotal)}</td>
                    <td className="p-3 text-right">{formatCurrency(o.deliveryFee)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatCurrency(o.commissionTotal)}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(o.total)}</td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {o.items?.length ?? 0} item(s)
                      {o.deliveryAddress && <div className="truncate max-w-[200px]">{o.deliveryAddress}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
