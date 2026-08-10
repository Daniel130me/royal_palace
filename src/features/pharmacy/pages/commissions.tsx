"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet, Receipt, TrendingUp, Building2, Info, ArrowRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type PeriodKey = "all" | "today" | "week" | "month";

const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: "all", label: "All time", days: 0 },
  { key: "today", label: "Today", days: 1 },
  { key: "week", label: "Last 7 days", days: 7 },
  { key: "month", label: "Last 30 days", days: 30 },
];

export function PharmacyCommissions() {
  const { profile, pharmacyId, loading, error, refresh } = usePharmacyContext();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("all");

  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    pharmacyOrderService
      .list({ pharmacyId })
      .then((list) => { if (!cancelled) setOrders(list); })
      .finally(() => { if (!cancelled) setLocalLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  // Commission is earned on fulfilled/delivered orders.
  const completedStatuses = ["delivered", "picked_up", "in_transit", "ready_for_pickup"];
  const earnedStatuses = ["delivered"]; // only delivered counts as truly earned

  const filteredOrders = useMemo(() => {
    if (period === "all") return orders;
    const days = PERIODS.find((p) => p.key === period)?.days ?? 0;
    if (days === 0) return orders;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return orders.filter((o) => (o.createdAt ?? "").slice(0, 10) >= cutoffStr);
  }, [orders, period]);

  const totalSales = filteredOrders.reduce((s, o) => s + o.subtotal, 0);
  const totalCommission = filteredOrders.reduce((s, o) => s + o.commissionTotal, 0);
  const totalNet = filteredOrders.reduce((s, o) => s + (o.subtotal - o.commissionTotal), 0);
  const earnedCommission = filteredOrders.filter((o) => earnedStatuses.includes(o.status)).reduce((s, o) => s + o.commissionTotal, 0);
  const pendingCommission = filteredOrders.filter((o) => !earnedStatuses.includes(o.status)).reduce((s, o) => s + o.commissionTotal, 0);

  if (loading || localLoading) return <LoadingState label="Loading commission report…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Commission reports"
        description="Track commission earned from each order. Platform rate is set centrally by Royal Palace."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Commissions" }]}
      />

      {/* Platform commission rate banner */}
      {profile && (
        <Alert className="mb-4 border-sky-200 bg-sky-50">
          <Building2 className="h-4 w-4 text-sky-600" />
          <AlertTitle className="text-sky-800">Platform commission rate</AlertTitle>
          <AlertDescription className="text-sky-700">
            Your platform commission rate is{" "}
            <span className="font-bold text-sky-900">{profile.commissionPct}%</span> of gross sales.
            This rate is set by the Royal Palace admin team and applies to every order.
            You cannot modify it.
          </AlertDescription>
        </Alert>
      )}

      {/* Period filter */}
      <div className="inline-flex flex-wrap rounded-lg border bg-background p-1 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Gross sales" value={formatCurrency(totalSales)} icon={Wallet} tone="info" />
        <MetricCard label="Commission earned" value={formatCurrency(earnedCommission)} icon={Receipt} tone="success" hint={`${profile?.commissionPct ?? 0}% rate`} />
        <MetricCard label="Pending commission" value={formatCurrency(pendingCommission)} icon={TrendingUp} tone="warning" hint="Not yet delivered" />
        <MetricCard label="Net to pharmacy" value={formatCurrency(totalNet)} icon={Wallet} tone="success" hint="After commission" />
      </div>

      {/* Orders with commission breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Orders & commission per item</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No orders in this period"
              description="Once orders are placed at your pharmacy, you will see the commission breakdown here."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Comm. %</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Pharmacy net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <button
                          className="text-left font-medium text-sky-700 hover:underline"
                          onClick={() => navigate("pharmacy", "order", { id: o.id })}
                        >
                          {o.orderNumber}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(o.createdAt)}</TableCell>
                      <TableCell className="text-xs">{o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(o.subtotal)}</TableCell>
                      <TableCell className="text-right">{o.pharmacy?.commissionPct ?? profile?.commissionPct ?? "—"}%</TableCell>
                      <TableCell className="text-right text-rose-700">{formatCurrency(o.commissionTotal)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">{formatCurrency(o.subtotal - o.commissionTotal)}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <TableRow className="border-t-2 font-bold">
                    <TableCell colSpan={3}>Totals</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSales)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-rose-700">{formatCurrency(totalCommission)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatCurrency(totalNet)}</TableCell>
                    <TableCell />
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert className="mt-4 border-muted bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Commission is calculated per order item using the platform rate at the time the order was
          placed. To see per-item commission, open an order detail.
        </AlertDescription>
      </Alert>
    </div>
  );
}
