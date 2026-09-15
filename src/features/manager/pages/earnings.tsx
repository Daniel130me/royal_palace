"use client";

// Manager Earnings page (plan §3.5): status breakdown + paginated ledger.
// Amounts are signed — reversals render negative in a warning tone.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatRateBps, TRANSACTION_TYPE_LABELS } from "@/lib/manager-constants";
import { Search, Coins, Clock3, CheckCircle2, Undo2 } from "lucide-react";
import type { ManagerEarning } from "@/types";

type EarningsResponse = {
  data: (ManagerEarning & { payoutNumber: string | null; payoutStatus: string | null })[];
  meta: { page: number; pageSize: number; total: number; totals: Record<string, { amount: number; count: number }> };
};

export function ManagerEarnings() {
  const [res, setRes] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes(await managerService.earnings({ status, search, pageSize: "20" }) as unknown as EarningsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load earnings.");
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const totals = res?.meta.totals ?? {};

  return (
    <div>
      <PageHeader
        title="Manager Earnings"
        description="Your revenue share from eligible organization payments. Refunds create separate reversal entries — history is never rewritten."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Pending" value={formatCurrency(totals.pending?.amount ?? 0)} hint="Matures 7 days after the payment" icon={Clock3} tone="warning" />
        <MetricCard label="Available" value={formatCurrency(totals.available?.amount ?? 0)} hint="Ready to request for payout" icon={Coins} tone="info" />
        <MetricCard label="Paid" value={formatCurrency(totals.paid?.amount ?? 0)} hint="Disbursed via payouts" icon={CheckCircle2} tone="success" />
        <MetricCard label="Reversed" value={formatCurrency(totals.reversed?.amount ?? 0)} hint="Netted by refunds" icon={Undo2} tone="danger" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by organization…" className="pl-9" aria-label="Search earnings" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "available", "paid", "reversed"].map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>
      </div>

      {loading && !res ? (
        <LoadingState label="Loading earnings ledger…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !res || res.data.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No earnings match this filter yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden sm:grid grid-cols-[1.1fr_1.6fr_0.9fr_0.7fr_0.9fr_0.9fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <span>Earning</span><span>Organization</span><span>Payment</span><span>Rate</span><span>Amount</span><span>Status</span>
            </div>
            {res.data.map((e) => (
              <div key={e.id} className="grid sm:grid-cols-[1.1fr_1.6fr_0.9fr_0.7fr_0.9fr_0.9fr] grid-cols-2 gap-3 px-4 py-3 border-b border-border/40 last:border-0 text-sm items-center hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.earningNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.occurredAt)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate">{e.organizationName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{e.organizationType}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate">{e.paymentNumber}</p>
                  <p className="text-xs text-muted-foreground">{TRANSACTION_TYPE_LABELS[e.paymentType] ?? e.paymentType}</p>
                </div>
                <div>{formatRateBps(e.rateBps)}</div>
                <div className={e.amount < 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                  {e.amount < 0 ? "−" : ""}{formatCurrency(Math.abs(e.amount))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ManagerStatusBadge status={e.status} />
                  {e.payoutNumber ? <span className="text-[11px] text-muted-foreground">{e.payoutNumber}</span> : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
