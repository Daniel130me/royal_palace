"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { deliveryService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Truck, Search, Filter, CheckCircle2, Wallet, Package, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = ["all", "assigned", "accepted", "heading_to_pickup", "arrived_at_pickup", "pickup_verified", "picked_up", "in_transit", "arrived_at_destination", "delivered", "failed", "returned", "cancelled"];

export function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deliveries"
        description="Read-only overview of every delivery across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Deliveries" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total" value={deliveries.length} icon={Truck} />
        <MetricCard label="In Transit" value={inTransitCount} icon={Package} tone="info" />
        <MetricCard label="Delivered" value={deliveredCount} icon={CheckCircle2} tone="success" />
        <MetricCard label="Total Payout" value={formatCurrency(totalPayout)} icon={Wallet} tone="info" />
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Delivery no, order, courier, recipient…" className="pl-9" />
        </div>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filters" className="relative">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Mobile collapsible filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
        <CollapsibleContent>
          <SectionCard title="Filters" icon={SlidersHorizontal}>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* Desktop inline filter */}
      <div className="hidden lg:block">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
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
        </SectionCard>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} title="No deliveries" description="No deliveries match your filters." />
      ) : (
        <SectionCard dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <p className="font-medium">{d.deliveryNumber}</p>
                      <p className="text-xs text-muted-foreground">{d.id}</p>
                    </TableCell>
                    <TableCell>
                      {d.logisticsProvider ? <span className="truncate block">{d.logisticsProvider.name}</span> : <span className="text-muted-foreground">{d.logisticsProviderId}</span>}
                    </TableCell>
                    <TableCell>{d.recipientName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{d.pickupLocation}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{d.deliveryLocation}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(d.payout)}</TableCell>
                    <TableCell><StatusBadge status={d.status} size="sm" /></TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.verificationCode}</code></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {filtered.map((d) => (
              <li key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{d.deliveryNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {d.logisticsProvider?.name ?? d.logisticsProviderId}
                    </p>
                  </div>
                  <StatusBadge status={d.status} size="sm" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-medium">{d.recipientName}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Payout</span>
                  <span className="font-semibold">{formatCurrency(d.payout)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Code</span>
                  <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{d.verificationCode}</code>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
