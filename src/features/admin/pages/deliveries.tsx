"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { deliveryService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Truck, Search, Filter, CheckCircle2, Wallet, Package } from "lucide-react";

const STATUS_OPTIONS = ["all", "assigned", "accepted", "heading_to_pickup", "arrived_at_pickup", "pickup_verified", "picked_up", "in_transit", "arrived_at_destination", "delivered", "failed", "returned", "cancelled"];

export function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = () => {
    setLoading(true);
    setError(null);
    deliveryService.list()
      .then(setDeliveries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load deliveries"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries
      .filter((d) => {
        if (statusFilter !== "all" && d.status !== statusFilter) return false;
        if (!q) return true;
        const provName = d.logisticsProvider?.name ?? "";
        return `${d.deliveryNumber} ${d.orderId} ${d.logisticsProviderId} ${provName} ${d.recipientName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.deliveryNumber.localeCompare(a.deliveryNumber));
  }, [deliveries, search, statusFilter]);

  const totalPayout = deliveries.reduce((s, d) => s + d.payout, 0);
  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;
  const inTransitCount = deliveries.filter((d) => ["assigned", "accepted", "heading_to_pickup", "arrived_at_pickup", "pickup_verified", "picked_up", "in_transit", "arrived_at_destination"].includes(d.status)).length;

  if (loading) return <LoadingState label="Loading deliveries…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Deliveries"
        description="Read-only overview of every delivery across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Deliveries" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total" value={deliveries.length} icon={Truck} />
        <MetricCard label="In Transit" value={inTransitCount} icon={Package} tone="info" />
        <MetricCard label="Delivered" value={deliveredCount} icon={CheckCircle2} tone="success" />
        <MetricCard label="Total Payout" value={formatCurrency(totalPayout)} icon={Wallet} tone="info" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Delivery no, order, courier, recipient…" />
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
        <EmptyState icon={Truck} title="No deliveries" description="No deliveries match your filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Delivery</th>
                  <th className="text-left p-3">Courier</th>
                  <th className="text-left p-3">Recipient</th>
                  <th className="text-left p-3">Pickup</th>
                  <th className="text-left p-3">Destination</th>
                  <th className="text-right p-3">Payout</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <p className="font-medium">{d.deliveryNumber}</p>
                      <p className="text-xs text-muted-foreground">{d.id}</p>
                    </td>
                    <td className="p-3">
                      {d.logisticsProvider ? <span className="truncate block">{d.logisticsProvider.name}</span> : <span className="text-muted-foreground">{d.logisticsProviderId}</span>}
                    </td>
                    <td className="p-3">{d.recipientName}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[180px]">{d.pickupLocation}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[180px]">{d.deliveryLocation}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(d.payout)}</td>
                    <td className="p-3"><StatusBadge status={d.status} /></td>
                    <td className="p-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.verificationCode}</code></td>
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
