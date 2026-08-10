"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { resource } from "@/lib/api-client";
import type { Payment, PharmacyOrder, Settlement, Delivery, LaboratoryBooking } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { CreditCard, Search, TrendingUp, Wallet, Truck, FlaskConical, Pill, RefreshCcw } from "lucide-react";

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

  if (loading) return <LoadingState label="Loading payments…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every patient payment on the platform, with provider payouts, pharmacy commissions, lab payouts and logistics payouts summarised."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Payments" }]}
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Patient Payments" value={formatCurrency(grossPayments)} icon={TrendingUp} tone="success" hint={`${payments.length} transaction(s)`} />
        <MetricCard label="Platform Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" hint="Commission + margins" />
        <MetricCard label="Provider Payouts" value={formatCurrency(providerPayout)} icon={Wallet} tone="info" />
        <MetricCard label="Pharmacy Commission" value={formatCurrency(pharmacyCommission)} icon={Pill} tone="info" hint={`${orders.length} order(s)`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Lab Payouts" value={formatCurrency(labPayout)} icon={FlaskConical} tone="info" hint={`${labBookings.length} booking(s)`} />
        <MetricCard label="Logistics Payouts" value={formatCurrency(logisticsPayout)} icon={Truck} tone="info" hint={`${deliveries.length} delivery(ies)`} />
        <MetricCard label="Refunds" value={formatCurrency(refundsTotal)} icon={RefreshCcw} tone={refundsTotal > 0 ? "danger" : "default"} />
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment number, patient, reference…" className="pl-9" />
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
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" description="Try adjusting the filter or search." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Payment</th>
                  <th className="text-left p-3">Patient</th>
                  <th className="text-left p-3">Method</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <p className="font-medium">{p.paymentNumber}</p>
                      <p className="text-xs text-muted-foreground">{p.reference ?? "—"}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.patientId}</td>
                    <td className="p-3 capitalize">{p.method}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                    <td className="p-3"><StatusBadge status={p.status} /></td>
                    <td className="p-3 text-muted-foreground">{formatDateTime(p.createdAt)}</td>
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
