"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { settlementService } from "@/lib/services";
import type { Settlement } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import {
  formatCurrency, formatDate, formatDateTime,
  isDeliveredToday, isDeliveredThisWeek,
} from "../delivery-helpers";
import {
  Wallet, TrendingUp, Clock, Search, ArrowRight, CalendarDays,
  Banknote, PiggyBank, Receipt,
} from "lucide-react";

export function LogisticsEarnings() {
  const { logisticsId, profile, completed, loading, error, refresh } = useLogisticsContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!logisticsId) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        return settlementService.list({ entityType: "logistics", entityId: logisticsId });
      })
      .then((rows) => {
        if (cancelled || !rows) return;
        const sorted = [...rows].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
        setSettlements(sorted);
        setSettlementsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSettlements([]);
        setSettlementsLoading(false);
      });
    return () => { cancelled = true; };
  }, [logisticsId]);

  const delivered = useMemo(() => completed.filter((d) => d.status === "delivered"), [completed]);

  const lifetime = useMemo(() => delivered.reduce((acc, d) => acc + (d.payout || 0), 0), [delivered]);
  const thisWeek = useMemo(() => delivered.filter(isDeliveredThisWeek).reduce((acc, d) => acc + (d.payout || 0), 0), [delivered]);
  const today = useMemo(() => delivered.filter(isDeliveredToday).reduce((acc, d) => acc + (d.payout || 0), 0), [delivered]);
  const pendingSettlements = settlements.filter((s) => s.status === "pending");
  const pendingNet = pendingSettlements.reduce((acc, s) => acc + (s.netAmount || 0), 0);
  const paidNet = settlements.filter((s) => s.status === "paid").reduce((acc, s) => acc + (s.netAmount || 0), 0);

  const filteredDelivered = useMemo(() => {
    if (!search.trim()) return delivered;
    const q = search.toLowerCase();
    return delivered.filter(
      (d) =>
        d.deliveryNumber.toLowerCase().includes(q) ||
        d.recipientName.toLowerCase().includes(q) ||
        d.deliveryLocation.toLowerCase().includes(q)
    );
  }, [delivered, search]);

  const sortedDelivered = useMemo(() => {
    const copy = [...filteredDelivered];
    copy.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return copy;
  }, [filteredDelivered]);

  if (loading && completed.length === 0 && !error) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  const filteredTotal = sortedDelivered.reduce((acc, d) => acc + (d.payout || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Earnings"
        description={
          profile
            ? `Payout summary for ${profile.name} (${profile.logisticsNumber}).`
            : "Your delivery payout summary and settlement history."
        }
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "history")}>
            View delivery history <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Lifetime earnings" value={formatCurrency(lifetime)} icon={Wallet} tone="success" hint={`${delivered.length} deliveries completed`} />
        <MetricCard label="This week" value={formatCurrency(thisWeek)} icon={TrendingUp} tone="info" hint={`${delivered.filter(isDeliveredThisWeek).length} delivered`} />
        <MetricCard label="Today" value={formatCurrency(today)} icon={Banknote} tone="success" hint={`${delivered.filter(isDeliveredToday).length} delivered`} />
        <MetricCard label="Pending settlement" value={formatCurrency(pendingNet)} icon={Clock} tone="warning" hint={`${pendingSettlements.length} period(s)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Per-delivery payouts */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Per-delivery payouts"
            icon={Receipt}
            action={<span className="text-xs text-muted-foreground">{delivered.length} delivered</span>}
            dense
          >
            <div className="p-4 sm:p-5 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by delivery number, recipient, location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {sortedDelivered.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Wallet}
                  title="No delivered payouts yet"
                  description={
                    search.trim()
                      ? "No deliveries match your search."
                      : "Complete deliveries to start earning payouts."
                  }
                  action={
                    !search.trim() ? (
                      <Button onClick={() => navigate("logistics", "assignments")}>
                        Find assignments
                      </Button>
                    ) : undefined
                  }
                  compact
                />
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block max-h-[28rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground sticky top-0 bg-card">
                      <tr>
                        <th className="text-left font-medium px-4 py-2">Delivery</th>
                        <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">Recipient</th>
                        <th className="text-left font-medium px-2 py-2 hidden md:table-cell">Date</th>
                        <th className="text-right font-medium px-4 py-2">Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDelivered.map((d) => (
                        <tr
                          key={d.id}
                          className="border-t border-border/60 hover:bg-accent/40 cursor-pointer"
                          onClick={() => navigate("logistics", "delivery", { id: d.id })}
                        >
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{d.deliveryNumber}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[12rem]">{d.deliveryLocation}</p>
                          </td>
                          <td className="px-2 py-2.5 hidden sm:table-cell">
                            <span className="truncate">{d.recipientName}</span>
                          </td>
                          <td className="px-2 py-2.5 hidden md:table-cell text-muted-foreground">
                            {d.updatedAt ? formatDate(d.updatedAt) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                            {formatCurrency(d.payout)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border/60 sticky bottom-0">
                      <tr className="bg-muted/40">
                        <td className="px-4 py-2.5 font-medium" colSpan={3}>
                          Total (filtered)
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700 tabular-nums">
                          {formatCurrency(filteredTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile cards */}
                <ul className="md:hidden max-h-[28rem] overflow-y-auto">
                  {sortedDelivered.map((d) => (
                    <li key={d.id} className="border-b border-border/60">
                      <button
                        onClick={() => navigate("logistics", "delivery", { id: d.id })}
                        className="w-full text-left p-4 hover:bg-accent/40 transition-colors tap-highlight-none"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{d.deliveryNumber}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{d.recipientName} · {d.deliveryLocation}</p>
                            {d.updatedAt && <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(d.updatedAt)}</p>}
                          </div>
                          <p className="font-bold text-emerald-700 shrink-0 tabular-nums">{formatCurrency(d.payout)}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                  <li className="bg-muted/40 p-3 flex items-center justify-between text-sm font-bold">
                    <span>Total</span>
                    <span className="text-emerald-700 tabular-nums">{formatCurrency(filteredTotal)}</span>
                  </li>
                </ul>
              </>
            )}
          </SectionCard>
        </div>

        {/* Settlements */}
        <div className="space-y-6">
          <SectionCard title="Settlement summary" icon={PiggyBank}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Settled (paid)</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5 tabular-nums">{formatCurrency(paidNet)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
                <p className="text-lg font-bold text-amber-700 mt-0.5 tabular-nums">{formatCurrency(pendingNet)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <MiniMetric label="Avg payout" value={formatCurrency(delivered.length ? Math.round(lifetime / delivered.length) : 0)} tone="info" />
              <MiniMetric label="Periods" value={settlements.length} />
            </div>
          </SectionCard>

          <SectionCard
            title="Settlements"
            icon={CalendarDays}
            action={<span className="text-xs text-muted-foreground">{settlements.length} total</span>}
            dense
          >
            {settlementsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            ) : settlements.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No settlements recorded yet. Completed deliveries are batched into periodic settlements.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 max-h-96 overflow-y-auto">
                {settlements.map((s) => (
                  <li key={s.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                      </p>
                      <StatusBadge status={s.status} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{s.settlementNumber}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                        <p className="text-sm font-medium tabular-nums">{formatCurrency(s.grossAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
                        <p className="text-sm font-medium text-rose-700 tabular-nums">–{formatCurrency(s.commissionAmount)}</p>
                      </div>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Net payout</span>
                      <span className={`font-bold tabular-nums ${s.status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>
                        {formatCurrency(s.netAmount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
