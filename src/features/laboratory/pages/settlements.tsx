"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabContext } from "../use-lab-context";
import { settlementService, laboratoryService } from "@/lib/services";
import type { Settlement, LaboratoryBooking } from "@/types";
import {
  PageHeader, SectionCard, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet, TrendingUp, Hourglass, CheckCircle2, Banknote } from "lucide-react";

export function LabSettlements() {
  const { labId, lab, reload } = useLabContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [bookings, setBookings] = useState<LaboratoryBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!labId) return;
    setLoading(true);
    Promise.all([
      settlementService.list({ entityType: "laboratory", entityId: labId }),
      laboratoryService.bookings(labId).catch(() => [] as LaboratoryBooking[]),
    ])
      .then(([stl, bks]) => {
        setSettlements(stl.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
        setBookings(bks);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load settlements."))
      .finally(() => setLoading(false));
  }, [labId]);

  const totals = useMemo(() => {
    const gross = settlements.reduce((s, x) => s + x.grossAmount, 0);
    const commission = settlements.reduce((s, x) => s + x.commissionAmount, 0);
    const net = settlements.reduce((s, x) => s + x.netAmount, 0);
    const pending = settlements.filter((s) => s.status === "pending").reduce((s, x) => s + x.netAmount, 0);
    const paid = settlements.filter((s) => s.status === "paid").reduce((s, x) => s + x.netAmount, 0);
    return { gross, commission, net, pending, paid };
  }, [settlements]);

  const earningsByBooking = useMemo(() => {
    const completed = bookings.filter((b) => ["completed", "result_published"].includes(b.status));
    return completed.reduce((s, b) => s + (b.price || 0), 0);
  }, [bookings]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlements & earnings"
        description={lab ? `${lab.name} · ${lab.laboratoryNumber}` : "Settlement history"}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total earnings" value={formatCurrency(earningsByBooking)} icon={Banknote} tone="success" />
        <MetricCard label="Settled (paid)" value={formatCurrency(totals.paid)} icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending payout" value={formatCurrency(totals.pending)} icon={Hourglass} tone="warning" />
        <MetricCard label="Platform commission" value={formatCurrency(totals.commission)} icon={TrendingUp} tone="info" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Total gross" value={formatCurrency(totals.gross)} tone="info" />
        <MiniMetric label="Total net" value={formatCurrency(totals.net)} tone="success" />
        <MiniMetric label="Settlements" value={settlements.length} />
        <MiniMetric label="Bookings (completed)" value={bookings.filter((b) => ["completed", "result_published"].includes(b.status)).length} />
      </div>

      <SectionCard title="How settlements work" icon={Wallet}>
        <div className="text-sm text-muted-foreground space-y-1 leading-relaxed">
          <p>Royal Palace collects payment from patients at booking and remits your lab payout on a monthly settlement cycle.</p>
          <p>Each settlement nets out the platform commission and shows the period and net amount payable to your laboratory.</p>
        </div>
      </SectionCard>

      {settlements.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No settlements yet"
          description="Settlements are generated at the end of each billing cycle. Your bookings will appear here once the cycle closes."
        />
      ) : (
        <SectionCard title="Settlement history" dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.settlementNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.grossAmount)}</TableCell>
                    <TableCell className="text-right text-rose-600">−{formatCurrency(s.commissionAmount)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatCurrency(s.netAmount)}</TableCell>
                    <TableCell><StatusBadge status={s.status} size="sm" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="bg-muted/40 font-medium">
                <TableRow>
                  <TableCell colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.gross)}</TableCell>
                  <TableCell className="text-right text-rose-600">−{formatCurrency(totals.commission)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{formatCurrency(totals.net)}</TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {settlements.map((s) => (
              <li key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{s.settlementNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</p>
                  </div>
                  <StatusBadge status={s.status} size="sm" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Gross</p>
                    <p className="font-medium mt-0.5">{formatCurrency(s.grossAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Commission</p>
                    <p className="font-medium text-rose-700 mt-0.5">−{formatCurrency(s.commissionAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Net</p>
                    <p className="font-bold text-emerald-700 mt-0.5">{formatCurrency(s.netAmount)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
