"use client";

import type { OrganizationFinanceComponents } from "@royal-palace/api-client";
import { Banknote, CalendarDays, CheckCircle2, Hourglass, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { EmptyState, ErrorState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { productionOrganizationFinanceService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

type Period = OrganizationFinanceComponents["schemas"]["SettlementPeriod"];
type Granularity = "DAY" | "MONTH" | "TOTAL";

export function LabSettlements() {
  const { labId, lab } = useLabContext();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("MONTH");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (labId === null) return;
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    setLoading(true);
    void productionOrganizationFinanceService.organization
      .report(labId, from.toISOString(), to.toISOString(), granularity)
      .then((response) => {
        setPeriods([...response.data]);
        setError(null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Settlement report could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [labId, granularity]);
  const totals = useMemo(() => summarizeByCurrency(periods), [periods]);

  if (loading) return <div className="space-y-5"><div className="h-9 w-48 animate-pulse rounded-lg bg-muted" /><SkeletonGrid count={4} /></div>;
  if (error !== null) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Settlements & earnings" description={lab ? `${lab.name} · verified payment earnings` : "Settlement history"} />
      {totals.map((total) => (
        <div key={total.currency} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{total.currency}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile label="Gross collected" value={formatMinorCurrency(total.gross, total.currency)} icon={Wallet} tone="info" />
            <StatTile label="Your earnings" value={formatMinorCurrency(total.payable, total.currency)} icon={Banknote} tone="success" />
            <StatTile label="Paid out" value={formatMinorCurrency(total.paid, total.currency)} icon={CheckCircle2} tone="success" />
            <StatTile label="Available" value={formatMinorCurrency(total.available, total.currency)} icon={Hourglass} tone="warning" />
          </div>
        </div>
      ))}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Earnings are created only from verified successful payments. Each currency is reported separately; refunds and disputes place affected funds on hold for reconciliation.
      </div>
      <SegmentedControl options={[{ value: "DAY" as Granularity, label: "Daily" }, { value: "MONTH" as Granularity, label: "Monthly" }, { value: "TOTAL" as Granularity, label: "Custom range total" }]} value={granularity} onChange={setGranularity} size="sm" />
      {periods.length === 0 ? (
        <EmptyState icon={Wallet} title="No settled earnings yet" description="Verified laboratory booking payments will appear here." compact />
      ) : (
        <div className="space-y-2">
          {periods.map((period) => (
              <ExpandableCard key={`${period.organization.id}-${period.currency}-${period.periodStart}`} leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><CalendarDays className="h-4 w-4 text-emerald-700" /></div>} title={`${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)}`} subtitle={`${period.earningCount} verified payment${period.earningCount === 1 ? "" : "s"} · ${period.currency}`} trailing={<div className="flex flex-col items-end gap-1"><span className="text-sm font-bold text-emerald-700">{formatMinorCurrency(period.payableAmountMinor, period.currency)}</span><StatusBadge status={BigInt(period.heldAmountMinor) > BigInt(0) ? "on_hold" : BigInt(period.paidAmountMinor) > BigInt(0) ? "paid" : "available"} size="sm" /></div>}>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><Metric label="Gross" value={formatMinorCurrency(period.grossAmountMinor, period.currency)} /><Metric label="Available" value={formatMinorCurrency(period.availableAmountMinor, period.currency)} /><Metric label="Reserved" value={formatMinorCurrency(period.reservedAmountMinor, period.currency)} /><Metric label="On hold" value={formatMinorCurrency(period.heldAmountMinor, period.currency)} /></div>
            </ExpandableCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold tabular-nums">{value}</p></div>;
}

function summarizeByCurrency(periods: Period[]) {
  const result = new Map<string, { available: string; currency: string; gross: string; paid: string; payable: string }>();
  for (const period of periods) {
    const current = result.get(period.currency) ?? { available: "0", currency: period.currency, gross: "0", paid: "0", payable: "0" };
    current.available = (BigInt(current.available) + BigInt(period.availableAmountMinor)).toString();
    current.gross = (BigInt(current.gross) + BigInt(period.grossAmountMinor)).toString();
    current.paid = (BigInt(current.paid) + BigInt(period.paidAmountMinor)).toString();
    current.payable = (BigInt(current.payable) + BigInt(period.payableAmountMinor)).toString();
    result.set(period.currency, current);
  }
  return [...result.values()];
}
