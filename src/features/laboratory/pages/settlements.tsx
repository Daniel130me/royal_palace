"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabContext } from "../use-lab-context";
import { settlementService, laboratoryService } from "@/lib/services";
import type { Settlement, LaboratoryBooking } from "@/types";
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState, ErrorState } from "@/components/healthcare/states";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/healthcare/metric-card";
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

  if (loading) return <LoadingState label="Loading settlements…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Settlements & earnings"
        description={lab ? `${lab.name} · ${lab.laboratoryNumber}` : "Settlement history"}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total earnings" value={formatCurrency(earningsByBooking)} icon={Banknote} tone="success" />
        <MetricCard label="Settled (paid)" value={formatCurrency(totals.paid)} icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending payout" value={formatCurrency(totals.pending)} icon={Hourglass} tone="warning" />
        <MetricCard label="Platform commission" value={formatCurrency(totals.commission)} icon={TrendingUp} tone="info" />
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-1.5"><Wallet className="h-4 w-4" /> How settlements work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Royal Palace collects payment from patients at booking and remits your lab payout on a monthly settlement cycle.</p>
          <p>Each settlement nets out the platform commission and shows the period and net amount payable to your laboratory.</p>
        </CardContent>
      </Card>

      {settlements.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No settlements yet"
          description="Settlements are generated at the end of each billing cycle. Your bookings will appear here once the cycle closes."
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Settlement history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Settlement</th>
                    <th className="text-left px-4 py-3 font-medium">Period</th>
                    <th className="text-right px-4 py-3 font-medium">Gross</th>
                    <th className="text-right px-4 py-3 font-medium">Commission</th>
                    <th className="text-right px-4 py-3 font-medium">Net</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{s.settlementNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(s.periodStart)} → {formatDate(s.periodEnd)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(s.grossAmount)}</td>
                      <td className="px-4 py-3 text-right text-rose-600">−{formatCurrency(s.commissionAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(s.netAmount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-medium">
                  <tr className="border-t">
                    <td className="px-4 py-3" colSpan={2}>Totals</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totals.gross)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">−{formatCurrency(totals.commission)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(totals.net)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
