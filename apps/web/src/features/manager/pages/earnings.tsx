"use client";

import type { ManagerEarningsReportResponse } from "@royal-palace/contracts";
import { useCallback, useEffect, useState } from "react";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "../components/manager-shared";

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function ManagerEarnings() {
  const defaults = defaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [granularity, setGranularity] = useState<"DAY" | "MONTH">("DAY");
  const [report, setReport] = useState<ManagerEarningsReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    const inclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    void managerPortalService
      .earnings({
        from: `${from}T00:00:00.000Z`,
        granularity,
        limit: 50,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        to: inclusiveEnd.toISOString(),
      })
      .then(setReport)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Earnings could not be loaded."),
      );
  }, [from, granularity, to]);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (report === null) return <LoadingState label="Loading earnings…" />;
  return (
    <div>
      <PageHeader
        description="Only your commission is shown. Gross patient payments, platform revenue, patient identity, and policy rates are never exposed here."
        title="Manager earnings"
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Filter label="From">
            <Input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </Filter>
          <Filter label="To">
            <Input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </Filter>
          <Filter label="Grouping">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              onChange={(event) => setGranularity(event.target.value as "DAY" | "MONTH")}
              value={granularity}
            >
              <option value="DAY">Daily</option>
              <option value="MONTH">Monthly</option>
            </select>
          </Filter>
          <Button className="self-end" onClick={load}>
            Run report
          </Button>
        </CardContent>
      </Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {report.totals.map((total) => (
          <Card key={total.currency}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{total.currency} total</p>
              <p className="text-xl font-bold">
                {formatMinorCurrency(total.amountMinor, total.currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          {report.entries.map((entry) => (
            <div
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b p-4 last:border-0"
              key={entry.id}
            >
              <div>
                <p className="font-medium">{entry.activityType}</p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.occurredAt)}</p>
              </div>
              <strong>{formatMinorCurrency(entry.amountMinor, entry.currency)}</strong>
              <ManagerStatusBadge status={entry.status} />
            </div>
          ))}
          {report.entries.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No earnings in this range.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Filter({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
