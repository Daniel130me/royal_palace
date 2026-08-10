"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabContext } from "../use-lab-context";
import { settlementService, laboratoryService } from "@/lib/services";
import type { Settlement, LaboratoryBooking } from "@/types";
import {
  PageHeader, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet, TrendingUp, Hourglass, CheckCircle2, Banknote, Activity } from "lucide-react";

type FilterKey = "all" | "paid" | "pending";

export function LabSettlements() {
  const { labId, lab, reload } = useLabContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [bookings, setBookings] = useState<LaboratoryBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

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

  const visible = useMemo(() => {
    if (filter === "all") return settlements;
    return settlements.filter((s) => s.status === filter);
  }, [settlements, filter]);

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
    <div className="space-y-4">
      <PageHeader
        title="Settlements & earnings"
        description={lab ? `${lab.name} · ${lab.laboratoryNumber}` : "Settlement history"}
      />

      {/* StatTiles — 4 compact stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total earnings" value={formatCurrency(earningsByBooking)} icon={Banknote} tone="success" />
        <StatTile label="Paid out" value={formatCurrency(totals.paid)} icon={CheckCircle2} tone="success" />
        <StatTile label="Pending payout" value={formatCurrency(totals.pending)} icon={Hourglass} tone="warning" />
        <StatTile label="Commission" value={formatCurrency(totals.commission)} icon={TrendingUp} tone="info" />
      </div>

      {/* Compact how-it-works banner */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 flex items-start gap-2.5">
        <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground">Monthly settlement cycle</p>
          <p className="mt-0.5">Royal Palace collects payment at booking and remits your lab payout net of platform commission.</p>
        </div>
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as FilterKey, label: "All", badge: settlements.length },
          { value: "paid" as FilterKey, label: "Paid", badge: settlements.filter((s) => s.status === "paid").length },
          { value: "pending" as FilterKey, label: "Pending", badge: settlements.filter((s) => s.status === "pending").length },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No settlements yet"
          description="Settlements are generated at the end of each billing cycle."
          compact
        />
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <ExpandableCard
              key={s.id}
              leading={
                <div className={s.status === "paid"
                  ? "rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"
                  : "rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"}>
                  {s.status === "paid"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <Hourglass className="h-4 w-4 text-amber-600" />}
                </div>
              }
              title={s.settlementNumber}
              subtitle={`${formatDate(s.periodStart)} → ${formatDate(s.periodEnd)}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</span>
                  <StatusBadge status={s.status} size="sm" />
                </div>
              }
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                    <p className="font-medium mt-0.5 tabular-nums">{formatCurrency(s.grossAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
                    <p className="font-medium text-rose-600 mt-0.5 tabular-nums">−{formatCurrency(s.commissionAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net payout</p>
                    <p className="font-bold text-emerald-700 mt-0.5 tabular-nums">{formatCurrency(s.netAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                  <Activity className="h-3 w-3" />
                  Settlement cycle completed. Funds remitted per platform terms.
                </div>
              </div>
            </ExpandableCard>
          ))}

          {/* Filtered totals footer */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {filter === "all" ? "All settlements" : filter === "paid" ? "Paid settlements" : "Pending settlements"} totals
            </span>
            <div className="flex items-center gap-3 font-medium">
              <span>Gross <span className="text-foreground tabular-nums">{formatCurrency(totals.gross)}</span></span>
              <span className="text-rose-600">−<span className="tabular-nums">{formatCurrency(totals.commission)}</span></span>
              <span className="text-emerald-700">Net <span className="tabular-nums">{formatCurrency(totals.net)}</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
