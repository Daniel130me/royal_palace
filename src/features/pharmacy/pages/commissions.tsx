"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatTile, ExpandableCard } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Wallet, Receipt, TrendingUp, Info, ArrowRight, Package, Hash, CalendarDays,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type PeriodKey = "all" | "today" | "week" | "month";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

/**
 * Pharmacy "Earnings" page (file kept as commissions.tsx + export name
 * PharmacyCommissions so the portal router import continues to resolve).
 *
 * NOTE: This page surfaces only the pharmacy's own gross sales and net
 * earnings. The platform commission removed by Royal Palace is intentionally
 * hidden from staff portals — admin retains full visibility in
 * src/features/admin/.
 */
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
    const days = period === "today" ? 1 : period === "week" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return orders.filter((o) => (o.createdAt ?? "").slice(0, 10) >= cutoffStr);
  }, [orders, period]);

  const totalSales = filteredOrders.reduce((s, o) => s + o.subtotal, 0);
  const totalNet = filteredOrders.reduce((s, o) => s + (o.subtotal - o.commissionTotal), 0);
  const earnedNet = filteredOrders.filter((o) => earnedStatuses.includes(o.status)).reduce((s, o) => s + (o.subtotal - o.commissionTotal), 0);
  const pendingNet = filteredOrders.filter((o) => !earnedStatuses.includes(o.status)).reduce((s, o) => s + (o.subtotal - o.commissionTotal), 0);

  if (loading || localLoading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Earnings"
        description="Track your gross sales and net earnings from each order."
      />

      {profile && (
        <Alert className="border-sky-200 bg-sky-50">
          <CalendarDays className="h-4 w-4 text-sky-600" />
          <AlertDescription className="text-sky-700">
            Royal Palace collects payment at the time of order and remits your net earnings
            at the end of each settlement cycle.
          </AlertDescription>
        </Alert>
      )}

      {/* Period filter */}
      <SegmentedControl
        options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        value={period}
        onChange={setPeriod}
        size="sm"
      />

      {/* StatTiles row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Gross sales" value={formatCurrency(totalSales)} icon={Wallet} tone="info" />
        <StatTile label="Earned" value={formatCurrency(earnedNet)} icon={Receipt} tone="success" />
        <StatTile label="Pending" value={formatCurrency(pendingNet)} icon={TrendingUp} tone="warning" />
        <StatTile label="Net earnings" value={formatCurrency(totalNet)} icon={Wallet} tone="success" />
      </div>

      {/* Per-order earnings list as ExpandableCards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Orders · {filteredOrders.length} total
          </p>
          <span className="text-xs text-muted-foreground">
            Avg order {formatCurrency(filteredOrders.length ? Math.round(totalSales / filteredOrders.length) : 0)}
          </span>
        </div>
        {filteredOrders.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No orders in this period"
            description="Once orders are placed at your pharmacy, you will see your earnings breakdown here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((o) => {
              const net = o.subtotal - o.commissionTotal;
              const isEarned = earnedStatuses.includes(o.status);
              return (
                <ExpandableCard
                  key={o.id}
                  leading={
                    <div className={`rounded-lg p-2 ring-1 ${isEarned ? "bg-emerald-50 ring-emerald-100" : "bg-amber-50 ring-amber-100"}`}>
                      <Package className={`h-4 w-4 ${isEarned ? "text-emerald-600" : "text-amber-600"}`} />
                    </div>
                  }
                  title={o.orderNumber}
                  subtitle={`${o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · ${formatDate(o.createdAt)}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(net)}</span>
                      <StatusBadge status={o.status} size="sm" />
                    </div>
                  }
                >
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> Gross
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{formatCurrency(o.subtotal)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                        <p className="text-[10px] text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> Your earnings
                        </p>
                        <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(net)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
                      {o.prescriptionId && (
                        <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                          <Hash className="h-2.5 w-2.5" /> Rx
                        </Badge>
                      )}
                      {!isEarned && (
                        <Badge variant="outline" className="text-[10px] h-5 border-amber-200 bg-amber-50 text-amber-700">
                          Earns on delivery
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7 px-2 text-xs"
                        onClick={() => navigate("pharmacy", "order", { id: o.id })}
                      >
                        View order <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </ExpandableCard>
              );
            })}

            {/* Totals card */}
            <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total gross sales</span>
                <span className="font-medium tabular-nums">{formatCurrency(totalSales)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total earnings</span>
                <span className="font-bold text-lg text-emerald-700 tabular-nums">{formatCurrency(totalNet)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Alert className="border-muted bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Earnings are calculated per order item and reflected once the order is delivered.
          Open an order detail to see the per-item breakdown.
        </AlertDescription>
      </Alert>
    </div>
  );
}
