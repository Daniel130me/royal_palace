"use client";

import type { OrganizationFinanceComponents } from "@royal-palace/api-client";
import { CheckCircle2, FlaskConical, Hourglass, Wallet, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { EmptyState, ErrorState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionOrganizationFinanceService } from "@/lib/services";

type Period = OrganizationFinanceComponents["schemas"]["SettlementPeriod"];
type Payout = OrganizationFinanceComponents["schemas"]["Payout"];

export function AdminSettlements() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = () => {
    const to = new Date(); to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to); from.setUTCFullYear(from.getUTCFullYear() - 1);
    setLoading(true);
    void Promise.all([productionOrganizationFinanceService.admin.report(from.toISOString(), to.toISOString(), "MONTH"), productionOrganizationFinanceService.admin.payouts()])
      .then(([report, payoutResponse]) => { setPeriods([...report.data]); setPayouts([...payoutResponse.data]); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Financial oversight data could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  const currencyTotals = useMemo(() => summarize(periods), [periods]);

  const review = async (payout: Payout, decision: "APPROVE" | "REJECT") => {
    setReviewing(payout.id);
    try {
      await productionOrganizationFinanceService.admin.review(payout.id, { decision, expectedVersion: payout.version, reasonCode: decision === "APPROVE" ? "FINANCE_REVIEW_APPROVED" : "FINANCE_REVIEW_REJECTED" });
      toast.success(`Payout ${decision === "APPROVE" ? "approved" : "rejected"}.`); load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Payout review failed."); }
    finally { setReviewing(null); }
  };

  if (loading) return <div className="space-y-5"><div className="h-9 w-48 animate-pulse rounded-lg bg-muted" /><SkeletonGrid count={4} /></div>;
  if (error !== null) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Settlements" description="Auditable earnings and payout review across connected organization financial modules." breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Settlements" }]} />
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">Laboratory settlement data is live. Provider, pharmacy, and logistics settlement modules remain visible in the signed prototype and will connect in their corresponding implementation increments.</div>
      {currencyTotals.map((total) => <div key={total.currency} className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{total.currency}</p><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"><StatTile label="Gross" value={formatMinorCurrency(total.gross, total.currency)} icon={Wallet} tone="info" /><StatTile label="Organization earnings" value={formatMinorCurrency(total.payable, total.currency)} icon={FlaskConical} tone="success" /><StatTile label="Reserved" value={formatMinorCurrency(total.reserved, total.currency)} icon={Hourglass} tone="warning" /><StatTile label="Paid" value={formatMinorCurrency(total.paid, total.currency)} icon={CheckCircle2} tone="success" /></div></div>)}
      <section className="space-y-2"><h2 className="text-sm font-semibold">Payout review queue</h2>{payouts.length === 0 ? <EmptyState icon={Wallet} title="No payout requests" description="Organization payout requests will appear here." compact /> : payouts.map((payout) => <ExpandableCard key={payout.id} leading={<div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"><Hourglass className="h-4 w-4 text-amber-700" /></div>} title={payout.payoutNumber} subtitle={`${payout.organization.displayName} · ${formatDate(payout.requestedAt)}`} trailing={<div className="flex flex-col items-end gap-1"><span className="font-bold">{formatMinorCurrency(payout.requestedAmountMinor, payout.currency)}</span><StatusBadge status={payout.status.toLowerCase()} size="sm" /></div>}><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{payout.organization.type} · version {payout.version}</p>{payout.status === "REQUESTED" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={reviewing === payout.id} onClick={() => void review(payout, "REJECT")}><XCircle className="h-3.5 w-3.5" /> Reject</Button><Button size="sm" disabled={reviewing === payout.id} onClick={() => void review(payout, "APPROVE")}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button></div>}</div></ExpandableCard>)}</section>
      <section className="space-y-2"><h2 className="text-sm font-semibold">Monthly laboratory settlements</h2>{periods.length === 0 ? <EmptyState icon={FlaskConical} title="No verified earnings" description="Successful laboratory payments will appear here." compact /> : periods.map((period) => <ExpandableCard key={`${period.organization.id}-${period.currency}-${period.periodStart}`} leading={<div className="rounded-lg bg-emerald-50 p-2"><FlaskConical className="h-4 w-4 text-emerald-700" /></div>} title={period.organization.displayName} subtitle={`${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)} · ${period.earningCount} payments`} trailing={<span className="font-bold">{formatMinorCurrency(period.payableAmountMinor, period.currency)}</span>}><div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><Metric label="Gross" value={formatMinorCurrency(period.grossAmountMinor, period.currency)} /><Metric label="Available" value={formatMinorCurrency(period.availableAmountMinor, period.currency)} /><Metric label="Reserved" value={formatMinorCurrency(period.reservedAmountMinor, period.currency)} /><Metric label="On hold" value={formatMinorCurrency(period.heldAmountMinor, period.currency)} /></div></ExpandableCard>)}</section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/40 p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>; }

function summarize(periods: Period[]) {
  const result = new Map<string, { currency: string; gross: string; paid: string; payable: string; reserved: string }>();
  for (const period of periods) {
    const current = result.get(period.currency) ?? { currency: period.currency, gross: "0", paid: "0", payable: "0", reserved: "0" };
    current.gross = (BigInt(current.gross) + BigInt(period.grossAmountMinor)).toString();
    current.payable = (BigInt(current.payable) + BigInt(period.payableAmountMinor)).toString();
    current.reserved = (BigInt(current.reserved) + BigInt(period.reservedAmountMinor)).toString();
    current.paid = (BigInt(current.paid) + BigInt(period.paidAmountMinor)).toString();
    result.set(period.currency, current);
  }
  return [...result.values()];
}
