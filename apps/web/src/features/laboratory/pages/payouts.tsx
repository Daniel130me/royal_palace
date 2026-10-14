"use client";

import type { OrganizationFinanceComponents } from "@royal-palace/api-client";
import { Banknote, CheckCircle2, Clock, Send, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { EmptyState, ErrorState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { productionOrganizationFinanceService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

type Payout = OrganizationFinanceComponents["schemas"]["Payout"];
type Period = OrganizationFinanceComponents["schemas"]["SettlementPeriod"];

export function LaboratoryPayouts() {
  const { labId } = useLabContext();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (labId === null) return;
    const to = new Date(); to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to); from.setUTCFullYear(from.getUTCFullYear() - 1);
    setLoading(true);
    void Promise.all([productionOrganizationFinanceService.organization.payouts(labId), productionOrganizationFinanceService.organization.report(labId, from.toISOString(), to.toISOString(), "TOTAL")])
      .then(([payoutResponse, report]) => { setPayouts([...payoutResponse.data]); setPeriods([...report.data]); setCurrency((current) => current || report.data[0]?.currency || ""); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Payout data could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [labId]);
  const balances = useMemo(() => periods.map((period) => ({ amount: period.availableAmountMinor, currency: period.currency })), [periods]);
  const available = balances.find((item) => item.currency === currency)?.amount ?? "0";

  const submit = async () => {
    if (labId === null || currency === "") return;
    const minor = majorToMinor(amount, currency);
    if (minor === null || BigInt(minor) <= BigInt(0)) { toast.error("Enter a valid payout amount."); return; }
    setSubmitting(true);
    try {
      await productionOrganizationFinanceService.organization.requestPayout(labId, { currency, requestedAmountMinor: minor }, crypto.randomUUID());
      toast.success("Payout request submitted for finance review."); setDialogOpen(false); setAmount(""); load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Payout request could not be submitted."); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="space-y-5"><div className="h-9 w-48 animate-pulse rounded-lg bg-muted" /><SkeletonGrid count={4} /></div>;
  if (error !== null) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Payouts" description="Request withdrawal of available laboratory earnings and track finance review." actions={<Button onClick={() => setDialogOpen(true)} disabled={balances.every((item) => BigInt(item.amount) <= BigInt(0))}><Send className="h-4 w-4" /> Request payout</Button>} />
      <div className="grid gap-2.5 sm:grid-cols-2">{balances.map((balance) => <StatTile key={balance.currency} label={`Available · ${balance.currency}`} value={formatMinorCurrency(balance.amount, balance.currency)} icon={Banknote} tone="success" />)}<StatTile label="Payout requests" value={payouts.length} icon={Wallet} tone="info" /></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Approval records an internal finance decision only. Automated bank transfer remains disabled until a payout provider and launch region are qualified.</div>
      {payouts.length === 0 ? <EmptyState icon={Send} title="No payout requests yet" description="Available earnings can be submitted for finance review." compact /> : <div className="space-y-2">{payouts.map((payout) => <ExpandableCard key={payout.id} leading={<div className="rounded-lg bg-muted p-2">{payout.status === "PAID" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-600" />}</div>} title={payout.payoutNumber} subtitle={`Requested ${formatDate(payout.requestedAt)}`} trailing={<div className="flex flex-col items-end gap-1"><span className="font-bold">{formatMinorCurrency(payout.requestedAmountMinor, payout.currency)}</span><StatusBadge status={payout.status.toLowerCase()} size="sm" /></div>}><p className="text-xs text-muted-foreground">Finance review: {payout.reviewReasonCode ?? "Pending"}</p></ExpandableCard>)}</div>}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>Request payout</DialogTitle><DialogDescription>Only verified, available earnings can be reserved. Requests cannot combine currencies.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="payout-currency">Currency</Label><select id="payout-currency" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={currency} onChange={(event) => setCurrency(event.target.value)}>{balances.map((balance) => <option key={balance.currency} value={balance.currency}>{balance.currency} · {formatMinorCurrency(balance.amount, balance.currency)} available</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="payout-amount">Amount</Label><Input id="payout-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><p className="text-xs text-muted-foreground">Available: {formatMinorCurrency(available, currency || "USD")}</p></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={submitting}>{submitting ? "Submitting…" : "Submit for review"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function majorToMinor(value: string, currency: string): string | null {
  try {
    const digits = new Intl.NumberFormat(undefined, { currency, style: "currency" }).resolvedOptions().maximumFractionDigits ?? 2;
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(value.trim())) return null;
    const [whole = "0", fraction = ""] = value.trim().split(".");
    return (BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0")).toString();
  } catch { return null; }
}
