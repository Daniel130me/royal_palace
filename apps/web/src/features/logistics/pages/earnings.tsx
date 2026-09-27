"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { settlementService } from "@/lib/services";
import type { Settlement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import {
  formatCurrency, formatDate,
  isDeliveredToday, isDeliveredThisWeek,
} from "../delivery-helpers";
import {
  Wallet, TrendingUp, Clock, Search,
  Banknote, PiggyBank, Receipt, CalendarDays,
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
      <div className="space-y-5">
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
    <div className="space-y-4">
      <PageHeader
        title="Earnings"
        description={
          profile
            ? `Payout summary for ${profile.name}.`
            : "Your delivery payout summary and settlement history."
        }
      />

      {/* StatTiles row */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Lifetime" value={formatCurrency(lifetime)} icon={Wallet} tone="success" />
        <StatTile label="This week" value={formatCurrency(thisWeek)} icon={TrendingUp} tone="info" />
        <StatTile label="Today" value={formatCurrency(today)} icon={Banknote} tone="success" />
        <StatTile label="Pending" value={formatCurrency(pendingNet)} icon={Clock} tone="warning" />
      </div>

      {/* Per-delivery payouts (CompactListItem) */}
      <SectionCard
        title="Per-delivery payouts"
        icon={Receipt}
        action={<span className="text-xs text-muted-foreground">{delivered.length} delivered</span>}
        dense
      >
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by delivery no., recipient, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
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
                <Button size="sm" onClick={() => navigate("logistics", "assignments")}>
                  Find assignments
                </Button>
              ) : undefined
            }
            compact
          />
        ) : (
          <>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
              {sortedDelivered.map((d) => (
                <CompactListItem
                  key={d.id}
                  leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><Banknote className="h-4 w-4 text-emerald-600" /></div>}
                  title={d.deliveryNumber}
                  subtitle={`${d.recipientName} · ${d.deliveryLocation}${d.updatedAt ? ` · ${formatDate(d.updatedAt)}` : ""}`}
                  trailing={<span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(d.payout)}</span>}
                  onClick={() => navigate("logistics", "delivery", { id: d.id })}
                  chevron
                />
              ))}
            </div>
            <div className="px-4 py-3 bg-muted/40 flex items-center justify-between text-sm font-bold border-t border-border/60">
              <span>Total (filtered)</span>
              <span className="text-emerald-700 tabular-nums">{formatCurrency(filteredTotal)}</span>
            </div>
          </>
        )}
      </SectionCard>

      {/* Settlement summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Settled (paid)" value={formatCurrency(paidNet)} icon={PiggyBank} tone="success" />
        <StatTile label="Pending" value={formatCurrency(pendingNet)} icon={Clock} tone="warning" />
      </div>

      {/* Settlements list */}
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
          <EmptyState
            icon={CalendarDays}
            title="No settlements yet"
            description="Completed deliveries are batched into periodic settlements."
            compact
          />
        ) : (
          <ul className="divide-y divide-border/60 max-h-96 overflow-y-auto">
            {settlements.map((s) => (
              <li key={s.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                  </p>
                  <StatusBadge status={s.status} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{s.settlementNumber}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(s.grossAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                    <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Your earnings</p>
                    <p className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
