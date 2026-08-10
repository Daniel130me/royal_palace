"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
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

  const earnedStatuses = ["delivered"];

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

  if (loading || localLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Commission reports"
        description="Track commission earned from each order. Platform rate is set centrally by Royal Palace."
      />

      {profile && (
        <Alert className="border-sky-200 bg-sky-50">
          <Building2 className="h-4 w-4 text-sky-600" />
          <AlertTitle className="text-sky-800">Platform commission rate</AlertTitle>
          <AlertDescription className="text-sky-700">
            Your platform commission rate is{" "}
            <span className="font-bold text-sky-900">{profile.commissionPct}%</span> of gross sales.
            This rate is set by the Royal Palace admin team and applies to every order.
          </AlertDescription>
        </Alert>
      )}

      {/* Period filter */}
      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md">
        <div className="inline-flex rounded-lg border bg-card p-1 overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                period === p.key ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Gross sales" value={formatCurrency(totalSales)} icon={Wallet} tone="info" />
        <MetricCard label="Commission earned" value={formatCurrency(earnedCommission)} icon={Receipt} tone="success" hint={`${profile?.commissionPct ?? 0}% rate`} />
        <MetricCard label="Pending commission" value={formatCurrency(pendingCommission)} icon={TrendingUp} tone="warning" hint="Not yet delivered" />
        <MetricCard label="Net to pharmacy" value={formatCurrency(totalNet)} icon={Wallet} tone="success" hint="After commission" />
      </div>

      {/* MiniMetric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Orders" value={filteredOrders.length} tone="info" />
        <MiniMetric label="Avg order" value={formatCurrency(filteredOrders.length ? Math.round(totalSales / filteredOrders.length) : 0)} />
        <MiniMetric label="Avg commission" value={formatCurrency(filteredOrders.length ? Math.round(totalCommission / filteredOrders.length) : 0)} tone="warning" />
        <MiniMetric label="Avg net" value={formatCurrency(filteredOrders.length ? Math.round(totalNet / filteredOrders.length) : 0)} tone="success" />
      </div>

      <SectionCard
        title="Orders & commission per item"
        description={`${filteredOrders.length} order(s)`}
        dense
      >
        {filteredOrders.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Wallet}
              title="No orders in this period"
              description="Once orders are placed at your pharmacy, you will see the commission breakdown here."
              compact
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
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
                          className="text-left font-medium text-primary hover:underline"
                          onClick={() => navigate("pharmacy", "order", { id: o.id })}
                        >
                          {o.orderNumber}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(o.createdAt)}</TableCell>
                      <TableCell className="text-xs">{o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(o.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.pharmacy?.commissionPct ?? profile?.commissionPct ?? "—"}%</TableCell>
                      <TableCell className="text-right text-rose-700 tabular-nums">{formatCurrency(o.commissionTotal)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700 tabular-nums">{formatCurrency(o.subtotal - o.commissionTotal)}</TableCell>
                      <TableCell><StatusBadge status={o.status} size="sm" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-border/60">
              {filteredOrders.map((o) => (
                <li key={o.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => navigate("pharmacy", "order", { id: o.id })}
                    >
                      {o.orderNumber}
                    </button>
                    <StatusBadge status={o.status} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · {formatDate(o.createdAt)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(o.subtotal)}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100">
                      <p className="text-[10px] text-rose-700 uppercase tracking-wider">Comm ({o.pharmacy?.commissionPct ?? profile?.commissionPct ?? "—"}%)</p>
                      <p className="text-sm font-semibold text-rose-700 tabular-nums">{formatCurrency(o.commissionTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Net</p>
                      <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(o.subtotal - o.commissionTotal)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Totals */}
            <div className="border-t border-border/60 px-4 sm:px-5 py-4 bg-muted/20 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total gross sales</span>
                <span className="font-medium tabular-nums">{formatCurrency(totalSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total commission</span>
                <span className="font-medium text-rose-700 tabular-nums">-{formatCurrency(totalCommission)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Net to pharmacy</span>
                <span className="font-bold text-lg text-emerald-700 tabular-nums">{formatCurrency(totalNet)}</span>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <Alert className="border-muted bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Commission is calculated per order item using the platform rate at the time the order was
          placed. To see per-item commission, open an order detail.
        </AlertDescription>
      </Alert>
    </div>
  );
}
