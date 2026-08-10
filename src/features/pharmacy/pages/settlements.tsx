"use client";

import { useEffect, useMemo, useState } from "react";
import { usePharmacyContext } from "../use-pharmacy-context";
import { settlementService, pharmacyOrderService } from "@/lib/services";
import type { Settlement, PharmacyOrder } from "@/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Receipt, Wallet, Clock, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PharmacySettlements() {
  const { profile, pharmacyId, loading, error, refresh } = usePharmacyContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [localLoading, setLocalLoading] = useState(true);

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
  const totalCommission = settlements.reduce((s, x) => s + x.commissionAmount, 0);
  const totalGross = settlements.reduce((s, x) => s + x.grossAmount, 0);

  const deliveredOrdersWithoutSettlement = useMemo(() => {
    return orders.filter((o) => o.status === "delivered");
  }, [orders]);

  if (loading || localLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const sorted = settlements.slice().sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlements"
        description="Royalty payouts from Royal Palace. Track pending and paid settlement periods."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Pending net" value={formatCurrency(totalPendingNet)} icon={Clock} tone="warning" hint={`${pending.length} period(s)`} />
        <MetricCard label="Paid net" value={formatCurrency(totalPaidNet)} icon={CheckCircle2} tone="success" hint={`${paid.length} period(s)`} />
        <MetricCard label="Commission paid" value={formatCurrency(totalCommission)} icon={Receipt} tone="info" hint={`${profile?.commissionPct ?? 0}% rate`} />
        <MetricCard label="Delivered orders" value={deliveredOrdersWithoutSettlement.length} icon={Wallet} hint="Eligible for settlement" />
      </div>

      {profile && (
        <Alert className="border-sky-200 bg-sky-50">
          <Info className="h-4 w-4 text-sky-600" />
          <AlertDescription className="text-sky-700 text-sm">
            Settlements run on a periodic cycle. Royal Palace deducts a{" "}
            <span className="font-bold text-sky-900">{profile.commissionPct}%</span> platform
            commission from each order and remits the net to your pharmacy at the end of each period.
          </AlertDescription>
        </Alert>
      )}

      <SectionCard
        title="Settlement periods"
        description={`${settlements.length} total · ${formatCurrency(totalGross)} gross`}
        dense
      >
        {settlements.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Receipt}
              title="No settlements yet"
              description="Your settlement periods will appear here once the first cycle completes."
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
                    <TableHead>Period</TableHead>
                    <TableHead>Settlement No.</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Net to pharmacy</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-medium">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</p>
                        <p className="text-xs text-muted-foreground">{s.entityName}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.settlementNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(s.grossAmount)}</TableCell>
                      <TableCell className="text-right text-rose-700 tabular-nums">{formatCurrency(s.commissionAmount)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</TableCell>
                      <TableCell><StatusBadge status={s.status} size="sm" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-border/60">
              {sorted.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.settlementNumber}</p>
                    </div>
                    <StatusBadge status={s.status} size="sm" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(s.grossAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100">
                      <p className="text-[10px] text-rose-700 uppercase tracking-wider">Commission</p>
                      <p className="text-sm font-semibold text-rose-700 tabular-nums">{formatCurrency(s.commissionAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Net</p>
                      <p className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Totals */}
            <div className="border-t border-border/60 px-4 sm:px-5 py-4 bg-muted/20 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total gross</span>
                <span className="font-medium tabular-nums">{formatCurrency(totalGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total commission</span>
                <span className="font-medium text-rose-700 tabular-nums">-{formatCurrency(totalCommission)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total net paid</span>
                <span className="font-bold text-lg text-emerald-700 tabular-nums">{formatCurrency(totalPaidNet)}</span>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
