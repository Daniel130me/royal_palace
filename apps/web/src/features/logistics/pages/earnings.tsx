"use client";

import type { OrganizationFinanceComponents } from "@royal-palace/api-client";
import { Banknote, CalendarDays, CheckCircle2, Hourglass, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { productionOrganizationFinanceService } from "@/lib/services";

import { useLogisticsContext } from "../use-logistics-context";

type Period = OrganizationFinanceComponents["schemas"]["SettlementPeriod"];
type ReportMode = "DAY" | "MONTH" | "CUSTOM";

export function LogisticsEarnings() {
  const { logisticsId, organizationName } = useLogisticsContext();
  const initialRange = useMemo(() => defaultRange(), []);
  const [mode, setMode] = useState<ReportMode>("DAY");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!logisticsId) return;
    const range = toIsoRange(fromDate, toDate);
    if (!range) {
      setError("Select a valid range of no more than 366 days.");
      setLoading(false);
      return;
    }
    setLoading(true);
    void productionOrganizationFinanceService.organization
      .report(logisticsId, range.from, range.to, mode === "CUSTOM" ? "TOTAL" : mode)
      .then((response) => {
        setPeriods([...response.data]);
        setError(null);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "The earnings report could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, [fromDate, logisticsId, mode, toDate]);

  useEffect(load, [load]);
  const totals = useMemo(() => summarizeByCurrency(periods), [periods]);

  if (loading && periods.length === 0)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Earnings"
        description={`${organizationName} · immutable organization-finance facts`}
      />
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Amounts are created only by verified finance events and are kept separate by currency.
        Delivery status in the browser never creates, estimates, or changes earnings.
      </div>
      <SegmentedControl
        options={[
          { value: "DAY" as ReportMode, label: "Daily" },
          { value: "MONTH" as ReportMode, label: "Monthly" },
          { value: "CUSTOM" as ReportMode, label: "Custom range" },
        ]}
        value={mode}
        onChange={setMode}
        size="sm"
      />
      <div className="grid gap-3 rounded-xl border border-border/60 bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="earnings-from">From</Label>
          <Input
            id="earnings-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="earnings-to">To</Label>
          <Input
            id="earnings-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <Button variant="outline" onClick={load}>
          Refresh report
        </Button>
      </div>
      {error !== null && <ErrorState message={error} onRetry={load} />}
      {error === null &&
        totals.map((total) => (
          <div key={total.currency} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {total.currency}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile
                label="Your earnings"
                value={formatMinorCurrency(total.payable, total.currency)}
                icon={Banknote}
                tone="success"
              />
              <StatTile
                label="Available"
                value={formatMinorCurrency(total.available, total.currency)}
                icon={Wallet}
                tone="success"
              />
              <StatTile
                label="Reserved"
                value={formatMinorCurrency(total.reserved, total.currency)}
                icon={Hourglass}
                tone="warning"
              />
              <StatTile
                label="Paid"
                value={formatMinorCurrency(total.paid, total.currency)}
                icon={CheckCircle2}
                tone="info"
              />
            </div>
          </div>
        ))}
      {error === null &&
        (periods.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No verified earnings in this range"
            description="Finance events will appear here once recorded. No delivery amount is inferred."
            compact
          />
        ) : (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Earning periods</h2>
            {periods.map((period) => (
              <ExpandableCard
                key={`${period.organization.id}-${period.currency}-${period.periodStart}`}
                leading={
                  <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                    <CalendarDays className="h-4 w-4 text-emerald-700" />
                  </div>
                }
                title={`${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)}`}
                subtitle={`${period.earningCount} verified finance event${period.earningCount === 1 ? "" : "s"} · ${period.currency}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-bold text-emerald-700">
                      {formatMinorCurrency(period.payableAmountMinor, period.currency)}
                    </span>
                    <StatusBadge
                      status={
                        BigInt(period.heldAmountMinor) > BigInt(0)
                          ? "on_hold"
                          : BigInt(period.paidAmountMinor) > BigInt(0)
                            ? "paid"
                            : "available"
                      }
                      size="sm"
                    />
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Metric
                    label="Gross"
                    value={formatMinorCurrency(period.grossAmountMinor, period.currency)}
                  />
                  <Metric
                    label="Available"
                    value={formatMinorCurrency(period.availableAmountMinor, period.currency)}
                  />
                  <Metric
                    label="Reserved"
                    value={formatMinorCurrency(period.reservedAmountMinor, period.currency)}
                  />
                  <Metric
                    label="On hold"
                    value={formatMinorCurrency(period.heldAmountMinor, period.currency)}
                  />
                </div>
              </ExpandableCard>
            ))}
          </section>
        ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: toDateInput(from), to: toDateInput(to) };
}
function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
function toIsoRange(fromValue: string, toValue: string) {
  const from = new Date(`${fromValue}T00:00:00.000Z`);
  const inclusiveTo = new Date(`${toValue}T00:00:00.000Z`);
  inclusiveTo.setUTCDate(inclusiveTo.getUTCDate() + 1);
  const duration = inclusiveTo.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 86_400_000) return null;
  return { from: from.toISOString(), to: inclusiveTo.toISOString() };
}
function summarizeByCurrency(periods: Period[]) {
  const result = new Map<
    string,
    { available: string; currency: string; paid: string; payable: string; reserved: string }
  >();
  for (const period of periods) {
    const current = result.get(period.currency) ?? {
      available: "0",
      currency: period.currency,
      paid: "0",
      payable: "0",
      reserved: "0",
    };
    current.available = (
      BigInt(current.available) + BigInt(period.availableAmountMinor)
    ).toString();
    current.paid = (BigInt(current.paid) + BigInt(period.paidAmountMinor)).toString();
    current.payable = (BigInt(current.payable) + BigInt(period.payableAmountMinor)).toString();
    current.reserved = (BigInt(current.reserved) + BigInt(period.reservedAmountMinor)).toString();
    result.set(period.currency, current);
  }
  return [...result.values()];
}
