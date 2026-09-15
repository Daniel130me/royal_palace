"use client";

// Transactions (plan §3.5): the exact payment-to-earning ledger explanation.
// Every row ties an organization payment to the Manager Earning it produced
// (or the negative reversal created by a refund). History is never rewritten.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatRateBps, TRANSACTION_TYPE_LABELS } from "@/lib/manager-constants";
import { ArrowLeftRight, Search, Info, Undo2 } from "lucide-react";
import type { ManagerEarning } from "@/types";

type LedgerItem = ManagerEarning & { payoutNumber: string | null; payoutStatus: string | null };
type LedgerResponse = { data: LedgerItem[]; meta: { page: number; pageSize: number; total: number } };

export function ManagerTransactions() {
  const [res, setRes] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryType, setEntryType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes((await managerService.earnings({ entryType, status, search, pageSize: "30" })) as unknown as LedgerResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [entryType, status, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="How each organization payment to Royal Palace became a Manager Earning — and how refunds created reversals."
      />

      <Card className="mb-4 border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            When a managed organization pays Royal Palace (subscription, renewal, platform or configured service fee), a snapshot of your
            active revenue-share rule and assignment is stored on the earning — so later reassignments or rule changes never change
            historical results. Refunds add a separate negative reversal entry; originals are never edited or deleted.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organization or payment number…" className="pl-9" aria-label="Search transactions" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "earning", "reversal"].map((t) => (
            <Button key={t} size="sm" variant={entryType === t ? "default" : "outline"} onClick={() => setEntryType(t)} className="capitalize">
              {t}
            </Button>
          ))}
          <div className="w-px bg-border mx-1" role="presentation" />
          {["all", "pending", "available", "paid", "reversed"].map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>
      </div>

      {loading && !res ? (
        <LoadingState label="Loading transactions…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !res || res.data.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No transactions match this filter.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:grid grid-cols-[1.2fr_1.6fr_1.3fr_1fr_0.7fr_1fr_0.9fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <span>Earning</span><span>Organization</span><span>Payment</span><span>Eligible</span><span>Rate</span><span>Amount</span><span>Status</span>
            </div>
            {res.data.map((e) => (
              <div key={e.id} className="grid md:grid-cols-[1.2fr_1.6fr_1.3fr_1fr_0.7fr_1fr_0.9fr] grid-cols-2 gap-3 px-4 py-3 border-b border-border/40 last:border-0 text-sm items-center hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate flex items-center gap-1.5">
                    {e.entryType === "reversal" ? <Undo2 className="h-3.5 w-3.5 text-rose-500" /> : <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    {e.earningNumber}
                  </p>
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
                <div className={e.eligibleAmount < 0 ? "text-rose-600 font-medium" : ""}>
                  {e.eligibleAmount < 0 ? "−" : ""}{formatCurrency(Math.abs(e.eligibleAmount))}
                </div>
                <div>{formatRateBps(e.rateBps)}</div>
                <div className={e.amount < 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                  {e.amount < 0 ? "−" : ""}{formatCurrency(Math.abs(e.amount))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ManagerStatusBadge status={e.status} />
                  {e.payoutNumber ? <span className="text-[11px] text-muted-foreground">→ {e.payoutNumber}</span> : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
