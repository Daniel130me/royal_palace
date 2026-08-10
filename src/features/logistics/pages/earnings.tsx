"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { settlementService } from "@/lib/services";
import type { Settlement } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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
    return () => {
      cancelled = true;
    };
  }, [logisticsId]);

  const delivered = useMemo(() => completed.filter((d) => d.status === "delivered"), [completed]);

  const lifetime = useMemo(
    () => delivered.reduce((acc, d) => acc + (d.payout || 0), 0),
    [delivered]
  );
  const thisWeek = useMemo(
    () => delivered.filter(isDeliveredThisWeek).reduce((acc, d) => acc + (d.payout || 0), 0),
    [delivered]
  );
  const today = useMemo(
    () => delivered.filter(isDeliveredToday).reduce((acc, d) => acc + (d.payout || 0), 0),
    [delivered]
  );
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
    return <LoadingState label="Loading earnings…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div>
      <PageHeader
        title="Earnings"
        description={
          profile
            ? `Payout summary for ${profile.name} (${profile.logisticsNumber}).`
            : "Your delivery payout summary and settlement history."
        }
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "history")}>
            View delivery history <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        }
      />

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Lifetime earnings"
          value={formatCurrency(lifetime)}
          icon={Wallet}
          tone="success"
          hint={`${delivered.length} deliveries completed`}
        />
        <MetricCard
          label="This week"
          value={formatCurrency(thisWeek)}
          icon={TrendingUp}
          tone="info"
          hint={`${delivered.filter(isDeliveredThisWeek).length} delivered`}
        />
        <MetricCard
          label="Today"
          value={formatCurrency(today)}
          icon={Banknote}
          tone="success"
          hint={`${delivered.filter(isDeliveredToday).length} delivered`}
        />
        <MetricCard
          label="Pending settlement"
          value={formatCurrency(pendingNet)}
          icon={Clock}
          tone="warning"
          hint={`${pendingSettlements.length} period(s)`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Per-delivery breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-600" /> Per-delivery payouts
              </CardTitle>
              <span className="text-xs text-muted-foreground">{delivered.length} delivered</span>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by delivery number, recipient, location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              {sortedDelivered.length === 0 ? (
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
                />
              ) : (
                <div className="max-h-[28rem] overflow-y-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground sticky top-0 bg-background">
                      <tr>
                        <th className="text-left font-medium px-2 py-2">Delivery</th>
                        <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">Recipient</th>
                        <th className="text-left font-medium px-2 py-2 hidden md:table-cell">Date</th>
                        <th className="text-right font-medium px-2 py-2">Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDelivered.map((d) => (
                        <tr
                          key={d.id}
                          className="border-t hover:bg-accent/40 cursor-pointer"
                          onClick={() => navigate("logistics", "delivery", { id: d.id })}
                        >
                          <td className="px-2 py-2.5">
                            <p className="font-medium">{d.deliveryNumber}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[12rem]">
                              {d.deliveryLocation}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 hidden sm:table-cell">
                            <span className="truncate">{d.recipientName}</span>
                          </td>
                          <td className="px-2 py-2.5 hidden md:table-cell text-muted-foreground">
                            {d.updatedAt ? formatDate(d.updatedAt) : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold text-emerald-700">
                            {formatCurrency(d.payout)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2">
                      <tr className="bg-muted/40">
                        <td className="px-2 py-2.5 font-medium" colSpan={3}>
                          Total (filtered)
                        </td>
                        <td className="px-2 py-2.5 text-right font-bold text-emerald-700">
                          {formatCurrency(sortedDelivered.reduce((acc, d) => acc + (d.payout || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settlements */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-emerald-600" /> Settlement summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-xs text-muted-foreground">Total settled (paid)</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(paidNet)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs text-muted-foreground">Pending settlement</p>
                <p className="text-xl font-bold text-amber-700">{formatCurrency(pendingNet)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Settlements
              </CardTitle>
              <span className="text-xs text-muted-foreground">{settlements.length} total</span>
            </CardHeader>
            <CardContent>
              {settlementsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                </div>
              ) : settlements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No settlements recorded yet. Completed deliveries are batched into periodic settlements.
                </p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {settlements.map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                        </p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.settlementNumber}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Gross</p>
                          <p className="font-medium">{formatCurrency(s.grossAmount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Commission</p>
                          <p className="font-medium text-rose-700">–{formatCurrency(s.commissionAmount)}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Net payout</span>
                        <span className={`font-bold ${s.status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>
                          {formatCurrency(s.netAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
