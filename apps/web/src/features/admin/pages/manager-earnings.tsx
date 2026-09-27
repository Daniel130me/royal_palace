"use client";

// Admin · Manager financial oversight (plan §3.8): revenue-share rules,
// Manager Earnings ledger totals and manager payout requests. Payout
// processing itself stays in the existing payouts console.

import { useCallback, useEffect, useState } from "react";
import { sessionApi } from "@/lib/api-client";
import { PageHeader, ErrorState, LoadingState, EmptyState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { formatRateBps, TRANSACTION_TYPE_LABELS, MANAGER_PAYOUT_STATUS_LABELS } from "@/lib/manager-constants";

interface RuleRow {
  id: string; managerName: string; managerNumber: string; organizationType: string; transactionType: string;
  rateBps: number; effectiveFrom: string; effectiveUntil?: string | null; status: string;
}
interface PayoutRow {
  id: string; payoutNumber: string; managerName: string; managerNumber: string; amountRequested: number;
  periodStart: string; periodEnd: string; status: string; requestedAt: string; processedAt?: string | null;
  adminNote?: string | null;
}

export function AdminManagerEarnings() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rulesJson, payoutsJson] = await Promise.all([
        sessionApi.get<{ data: { rules: RuleRow[] } }>("/api/admin/manager-data?view=rules"),
        sessionApi.get<{ data: PayoutRow[] }>("/api/admin/manager-data?view=payouts"),
      ]);
      setRules(rulesJson.data.rules ?? []);
      setPayouts(payoutsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manager financials.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!rules || !payouts) return <LoadingState label="Loading manager financials…" />;

  return (
    <div>
      <PageHeader
        title="Manager Earnings & Rules"
        description="Configured revenue-share rules (basis points), manager payouts and their status. Rates are effective-dated and snapshotted on each earning."
      />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Revenue share rules</TabsTrigger>
          <TabsTrigger value="payouts">Payout requests</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          {rules.length === 0 ? (
            <EmptyState title="No rules configured" description="Create rules from a manager's detail page." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="hidden md:grid grid-cols-[1.4fr_1fr_1.2fr_0.8fr_1.4fr_0.8fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <span>Manager</span><span>Scope</span><span>Type</span><span>Rate</span><span>Effective</span><span>Status</span>
                </div>
                {rules.map((r) => (
                  <div key={r.id} className="grid md:grid-cols-[1.4fr_1fr_1.2fr_0.8fr_1.4fr_0.8fr] grid-cols-2 gap-3 px-4 py-3 border-b border-border/40 last:border-0 text-sm items-center">
                    <div className="min-w-0"><p className="truncate font-medium">{r.managerName}</p><p className="text-xs text-muted-foreground">{r.managerNumber}</p></div>
                    <p className="capitalize">{r.organizationType}</p>
                    <p>{TRANSACTION_TYPE_LABELS[r.transactionType as keyof typeof TRANSACTION_TYPE_LABELS] ?? r.transactionType}</p>
                    <p className="font-semibold">{formatRateBps(r.rateBps)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.effectiveFrom)} → {r.effectiveUntil ? formatDate(r.effectiveUntil) : "open"}</p>
                    <ManagerStatusBadge status={r.status === "active" ? "approved" : "rejected"} label={r.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payouts">
          {payouts.length === 0 ? (
            <EmptyState title="No manager payouts" description="Manager payout requests will appear here." />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Manager payouts</CardTitle>
                <CardDescription>Processing happens in the existing payouts console — this is the oversight view.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {payouts.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5 border-b border-border/40 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{p.payoutNumber}</p>
                        <ManagerStatusBadge status={p.status} label={MANAGER_PAYOUT_STATUS_LABELS[p.status as keyof typeof MANAGER_PAYOUT_STATUS_LABELS]} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.managerName} ({p.managerNumber}) · {p.periodStart} → {p.periodEnd} · requested {formatDateTime(p.requestedAt)}
                      </p>
                      {p.adminNote ? <p className="text-[11px] text-muted-foreground mt-0.5">Note: {p.adminNote}</p> : null}
                    </div>
                    <p className="font-bold">{formatCurrency(p.amountRequested)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
