"use client";

// Payouts page (plan §3.6): available balance, masked bank details, payout
// history and the request dialog. The server re-validates every request
// against the available balance inside a transaction.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ManagerStatusBadge, ManagerEmptyState } from "../components/manager-shared";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Landmark, Wallet, ShieldCheck, Clock3 } from "lucide-react";
import { toast } from "sonner";

interface PayoutRow {
  id: string;
  payoutNumber: string;
  amountRequested: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  method: string;
  requestedAt: string;
  processedAt?: string | null;
  adminNote?: string | null;
  allocatedEarnings?: { earningNumber: string; amount: number }[];
}

interface PayoutsPayload {
  payouts: PayoutRow[];
  availableBalance: number;
  bankAccount: { id: string; bankName: string; accountName: string; accountNumberMasked: string; verificationStatus: string } | null;
}

export function ManagerPayouts() {
  const [data, setData] = useState<PayoutsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await managerService.payouts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payouts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Enter a whole-naira amount.");
      return;
    }
    setSubmitting(true);
    try {
      await managerService.requestPayout({ amountRequested: parsed, notes });
      toast.success("Payout requested — Royal Palace will review it shortly.");
      setOpen(false);
      setAmount("");
      setNotes("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request payout.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) return <LoadingState label="Loading payouts…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const hasPending = data.payouts.some((p) => p.status === "requested" || p.status === "processing");

  return (
    <div>
      <PageHeader title="Payouts" description="Request payouts of your available Manager Earnings. Requests are validated against your balance and reviewed by Royal Palace." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <MetricCard label="Available balance" value={formatCurrency(data.availableBalance)} hint="Unallocated, matured earnings" icon={Wallet} tone="success" />
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2"><Landmark className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Payout account</p>
                {data.bankAccount ? (
                  <>
                    <p className="mt-1 font-semibold text-lg leading-none">{data.bankAccount.accountNumberMasked}</p>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{data.bankAccount.bankName} · {data.bankAccount.accountName}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No bank account on file yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Verification</p>
                <p className="mt-1 text-sm font-semibold">{data.bankAccount ? (data.bankAccount.verificationStatus === "verified" ? "Account verified" : data.bankAccount.verificationStatus) : "Pending"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Account numbers are always masked.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Payout requests</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={hasPending || data.availableBalance <= 0}>
              <Wallet className="h-4 w-4" /> Request payout
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request a payout</DialogTitle>
              <DialogDescription>
                Available balance: <strong>{formatCurrency(data.availableBalance)}</strong>. Royal Palace reviews requests and disburses to your verified account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="payout-amount">Amount (₦, whole naira)</Label>
                <Input id="payout-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="10000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payout-notes">Notes (optional)</Label>
                <Input id="payout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the finance team should know" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void submit()} disabled={submitting || !amount}>
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {data.payouts.length === 0 ? (
        <ManagerEmptyState
          title="No payouts yet"
          description="Once your earnings mature, request a payout and track it here."
          actionLabel={data.availableBalance > 0 ? "Request payout" : undefined}
          onAction={data.availableBalance > 0 ? () => setOpen(true) : undefined}
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> History</CardTitle>
            <CardDescription>Requested, processing, paid and rejected payouts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.payouts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{p.payoutNumber}</p>
                    <ManagerStatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Requested {formatDateTime(p.requestedAt)}
                    {p.processedAt ? ` · Processed ${formatDate(p.processedAt)}` : ""}
                  </p>
                  {p.allocatedEarnings && p.allocatedEarnings.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Allocations: {p.allocatedEarnings.map((a) => a.earningNumber).join(", ")}
                    </p>
                  ) : null}
                  {p.adminNote ? <p className="text-[11px] text-muted-foreground mt-0.5">Admin note: {p.adminNote}</p> : null}
                </div>
                <p className="font-bold text-right">{formatCurrency(p.amountRequested)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
