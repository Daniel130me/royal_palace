"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { resource } from "@/lib/api-client";
import type { Payment, PharmacyOrder, Settlement, Delivery, LaboratoryBooking } from "@/types";
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
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CreditCard, Search, TrendingUp, Wallet, Truck, FlaskConical, Pill, RefreshCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [labBookings, setLabBookings] = useState<LaboratoryBooking[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...payments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (!q) return true;
        return `${p.paymentNumber} ${p.patientId} ${p.reference ?? ""} ${p.method}`.toLowerCase().includes(q);
      });
  }, [payments, search, statusFilter]);

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0);

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
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Every patient payment on the platform, with provider payouts, pharmacy commissions, lab payouts and logistics payouts summarised."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Payments" }]}
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Patient Payments" value={formatCurrency(grossPayments)} icon={TrendingUp} tone="success" hint={`${payments.length} transaction(s)`} />
        <MetricCard label="Platform Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" hint="Commission + margins" />
        <MetricCard label="Provider Payouts" value={formatCurrency(providerPayout)} icon={Wallet} tone="info" />
        <MetricCard label="Pharmacy Commission" value={formatCurrency(pharmacyCommission)} icon={Pill} tone="info" hint={`${orders.length} order(s)`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard label="Lab Payouts" value={formatCurrency(labPayout)} icon={FlaskConical} tone="violet" hint={`${labBookings.length} booking(s)`} />
        <MetricCard label="Logistics Payouts" value={formatCurrency(logisticsPayout)} icon={Truck} tone="info" hint={`${deliveries.length} delivery(ies)`} />
        <MetricCard label="Refunds" value={formatCurrency(refundsTotal)} icon={RefreshCcw} tone={refundsTotal > 0 ? "danger" : "default"} />
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment number, patient, reference…" className="pl-9" />
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

      {/* Mobile collapsible filter */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
        <CollapsibleContent>
          <SectionCard title="Filters" icon={SlidersHorizontal}>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="successful">Successful</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* Desktop inline filter */}
      <div className="hidden lg:block">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="search-d" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search-d" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment number, patient, reference…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="successful">Successful</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" description="Try adjusting the filter or search." />
      ) : (
        <SectionCard dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{p.paymentNumber}</p>
                      <p className="text-xs text-muted-foreground">{p.reference ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.patientId}</TableCell>
                    <TableCell className="capitalize">{p.method}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><StatusBadge status={p.status} size="sm" /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {filtered.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{p.paymentNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.reference ?? "—"}</p>
                  </div>
                  <StatusBadge status={p.status} size="sm" />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{p.method} · {p.patientId}</span>
                  <span className="font-semibold">{formatCurrency(p.amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{formatDateTime(p.createdAt)}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
