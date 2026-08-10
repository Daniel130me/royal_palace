"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
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
import { Package, Search, Filter, Wallet, TrendingUp, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = ["all", "paid", "prescription_under_review", "accepted", "preparing", "ready_for_pickup", "picked_up", "in_transit", "delivered", "cancelled", "refunded"];

export function AdminOrders() {
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        title="Pharmacy Orders"
        description="Read-only overview of every pharmacy order across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pharmacy Orders" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total Orders" value={orders.length} icon={Package} />
        <MetricCard label="GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} tone="success" />
        <MetricCard label="Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="info" />
        <MetricCard label="Delivered" value={deliveredCount} icon={CheckCircle2} tone="success" />
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, patient, pharmacy…" className="pl-9" />
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
        </SectionCard>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No orders" description="No pharmacy orders match your filters." />
      ) : (
        <SectionCard dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Pharmacy</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <p className="font-medium">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{o.id}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{o.patientId}</TableCell>
                    <TableCell>
                      {o.pharmacy ? <span className="truncate block">{o.pharmacy.name}</span> : <span className="text-muted-foreground">{o.pharmacyId}</span>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(o.subtotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(o.deliveryFee)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatCurrency(o.commissionTotal)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(o.total)}</TableCell>
                    <TableCell><StatusBadge status={o.status} size="sm" /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.items?.length ?? 0} item(s)
                      {o.deliveryAddress && <div className="truncate max-w-[200px]">{o.deliveryAddress}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {filtered.map((o) => (
              <li key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{o.orderNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {o.pharmacy?.name ?? o.pharmacyId}
                    </p>
                  </div>
                  <StatusBadge status={o.status} size="sm" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Total</p>
                    <p className="font-semibold mt-0.5">{formatCurrency(o.total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Commission</p>
                    <p className="font-medium text-emerald-700 mt-0.5">{formatCurrency(o.commissionTotal)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {o.items?.length ?? 0} item(s) · {o.patientId}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
