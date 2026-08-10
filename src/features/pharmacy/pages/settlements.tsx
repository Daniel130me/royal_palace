"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { settlementService, pharmacyOrderService } from "@/lib/services";
import type { Settlement, PharmacyOrder } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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

  // Unsettled orders = delivered but not yet in a paid settlement period
  const deliveredOrdersWithoutSettlement = useMemo(() => {
    return orders.filter((o) => o.status === "delivered");
  }, [orders]);

  if (loading || localLoading) return <LoadingState label="Loading settlements…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Settlements"
        description="Royalty payouts from Royal Palace. Track pending and paid settlement periods."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Settlements" }]}
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Pending net"
          value={formatCurrency(totalPendingNet)}
          icon={Clock}
          tone="warning"
          hint={`${pending.length} period(s)`}
        />
        <MetricCard
          label="Paid net"
          value={formatCurrency(totalPaidNet)}
          icon={CheckCircle2}
          tone="success"
          hint={`${paid.length} period(s)`}
        />
        <MetricCard
          label="Commission paid"
          value={formatCurrency(totalCommission)}
          icon={Receipt}
          tone="info"
          hint={`${profile?.commissionPct ?? 0}% rate`}
        />
        <MetricCard
          label="Delivered orders"
          value={deliveredOrdersWithoutSettlement.length}
          icon={Wallet}
          tone="default"
          hint="Eligible for settlement"
        />
      </div>

      {profile && (
        <Alert className="mb-4 border-sky-200 bg-sky-50">
          <Info className="h-4 w-4 text-sky-600" />
          <AlertDescription className="text-sky-700 text-sm">
            Settlements run on a periodic cycle. Royal Palace deducts a{" "}
            <span className="font-bold text-sky-900">{profile.commissionPct}%</span> platform
            commission from each order and remits the net to your pharmacy at the end of each period.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Settlement periods</CardTitle>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No settlements yet"
              description="Your settlement periods will appear here once the first cycle completes."
            />
          ) : (
            <div className="overflow-x-auto">
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
                  {settlements
                    .slice()
                    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
                    .map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <p className="font-medium">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</p>
                          <p className="text-xs text-muted-foreground">{s.entityName}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.settlementNumber}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.grossAmount)}</TableCell>
                        <TableCell className="text-right text-rose-700">{formatCurrency(s.commissionAmount)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(s.netAmount)}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
