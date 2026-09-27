"use client";

import { useEffect, useMemo, useState } from "react";
import { usePharmacyContext } from "../use-pharmacy-context";
import { settlementService, pharmacyOrderService } from "@/lib/services";
import type { Settlement, PharmacyOrder } from "@/types";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatTile, ExpandableCard } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Receipt, Wallet, Clock, CheckCircle2, Info, CalendarDays } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Filter = "all" | "pending" | "paid";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
];

export function PharmacySettlements() {
  const { profile, pharmacyId, loading, error, refresh } = usePharmacyContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    Promise.all([
      settlementService.list({ entityType: "pharmacy", entityId: pharmacyId }),
      pharmacyOrderService.list({ pharmacyId }),
    ])
      .then(([s, o]) => {
        if (cancelled) return;
        setSettlements(s);
        setOrders(o);
      })
      .finally(() => { if (!cancelled) setLocalLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const pending = useMemo(() => settlements.filter((s) => s.status === "pending"), [settlements]);
  const paid = useMemo(() => settlements.filter((s) => s.status === "paid"), [settlements]);

  const totalPendingNet = pending.reduce((s, x) => s + x.netAmount, 0);
  const totalPaidNet = paid.reduce((s, x) => s + x.netAmount, 0);
  const totalGross = settlements.reduce((s, x) => s + x.grossAmount, 0);

  const deliveredOrdersWithoutSettlement = useMemo(() => {
    return orders.filter((o) => o.status === "delivered");
  }, [orders]);

  const filtered = useMemo(() => {
    const sorted = settlements.slice().sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    if (filter === "pending") return sorted.filter((s) => s.status === "pending");
    if (filter === "paid") return sorted.filter((s) => s.status === "paid");
    return sorted;
  }, [settlements, filter]);

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
        title="Settlements"
        description="Royalty payouts from Royal Palace. Track pending and paid settlement periods."
      />

      {/* StatTiles row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Pending net" value={formatCurrency(totalPendingNet)} icon={Clock} tone="warning" />
        <StatTile label="Paid net" value={formatCurrency(totalPaidNet)} icon={CheckCircle2} tone="success" />
        <StatTile label="Total gross" value={formatCurrency(totalGross)} icon={Wallet} tone="default" />
        <StatTile label="Delivered orders" value={deliveredOrdersWithoutSettlement.length} icon={Receipt} tone="info" />
      </div>

      {profile && (
        <Alert className="border-sky-200 bg-sky-50">
          <Info className="h-4 w-4 text-sky-600" />
          <AlertDescription className="text-sky-700 text-sm">
            Settlements run on a periodic cycle. Royal Palace collects payment at the time of order and remits your pharmacy earnings at the end of each period.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settlement periods · {settlements.length} total · {formatCurrency(totalGross)} gross
        </p>
      </div>

      {/* Filter */}
      <SegmentedControl
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, badge: f.value === "pending" ? pending.length : f.value === "paid" ? paid.length : settlements.length }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={filter === "all" ? "No settlements yet" : `No ${filter} settlements`}
          description="Your settlement periods will appear here once the first cycle completes."
          compact
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const isPaid = s.status === "paid";
            return (
              <ExpandableCard
                key={s.id}
                leading={
                  <div className={`rounded-lg p-2 ring-1 ${isPaid ? "bg-emerald-50 ring-emerald-100" : "bg-amber-50 ring-amber-100"}`}>
                    {isPaid ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                  </div>
                }
                title={s.settlementNumber}
                subtitle={`${formatDate(s.periodStart)} → ${formatDate(s.periodEnd)} · ${s.entityName ?? "Pharmacy"}`}
                trailing={
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${isPaid ? "text-emerald-700" : "text-amber-700"}`}>
                      {formatCurrency(s.netAmount)}
                    </span>
                    <StatusBadge status={s.status} size="sm" />
                  </div>
                }
              >
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> Gross
                      </p>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(s.grossAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> Your earnings
                      </p>
                      <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span>Period</span>
                    <span className="font-medium">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</span>
                  </div>
                </div>
              </ExpandableCard>
            );
          })}

          {/* Totals card */}
          <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total gross</span>
              <span className="font-medium tabular-nums">{formatCurrency(totalGross)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total earnings paid</span>
              <span className="font-bold text-lg text-emerald-700 tabular-nums">{formatCurrency(totalPaidNet)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
