"use client";

/**
 * Shared "Payouts" view used by the provider, pharmacy, laboratory and
 * logistics portals. Each portal renders this with its own
 * entityType/entityId/entityName/entityLabel.
 *
 * The entity ONLY sees its own gross earnings and net payout — the platform
 * commission removed by Royal Palace is NEVER surfaced here (admin retains
 * full visibility in the admin settlements/payments pages).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { payoutService, settlementService } from "@/lib/services";
import type { PayoutRequest, PayoutStatus, Settlement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  EmptyState,
  SkeletonGrid,
  ErrorState,
  SectionCard,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  Wallet, Banknote, Clock, CheckCircle2, Hourglass, Send,
  TrendingUp, CalendarDays, Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

type PayoutEntityType = "provider" | "pharmacy" | "laboratory" | "logistics";

type Filter = "all" | "requested" | "processing" | "paid" | "rejected";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

interface PayoutsViewProps {
  entityType: PayoutEntityType;
  entityId: string | null;
  entityName: string;
  /** Short label used in copy, e.g. "consultations", "orders", "deliveries" */
  earningsDescription: string;
}

export function PayoutsView({ entityType, entityId, entityName, earningsDescription }: PayoutsViewProps) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [stls, pays] = await Promise.all([
        settlementService.list({ entityType, entityId }),
        payoutService.listForEntity(entityType, entityId),
      ]);
      setSettlements(stls.slice().sort((a, b) => b.periodStart.localeCompare(a.periodStart)));
      setPayouts(pays.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payouts.");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const gross = settlements.reduce((s, x) => s + x.grossAmount, 0);
    const net = settlements.reduce((s, x) => s + x.netAmount, 0);
    const paidNet = settlements.filter((s) => s.status === "paid").reduce((s, x) => s + x.netAmount, 0);
    const pendingNet = settlements.filter((s) => s.status === "pending").reduce((s, x) => s + x.netAmount, 0);
    // Withdrawable = pending settlement net minus already-requested (non-rejected) amounts.
    const requestedNotRejected = payouts
      .filter((p) => p.status !== "rejected")
      .reduce((s, p) => s + p.amountRequested, 0);
    const withdrawable = Math.max(0, pendingNet - requestedNotRejected);
    return { gross, net, paidNet, pendingNet, withdrawable };
  }, [settlements, payouts]);

  const filteredPayouts = useMemo(() => {
    if (filter === "all") return payouts;
    return payouts.filter((p) => p.status === filter);
  }, [payouts, filter]);

  const counts = useMemo(() => ({
    all: payouts.length,
    requested: payouts.filter((p) => p.status === "requested").length,
    processing: payouts.filter((p) => p.status === "processing").length,
    paid: payouts.filter((p) => p.status === "paid").length,
    rejected: payouts.filter((p) => p.status === "rejected").length,
  }), [payouts]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payouts"
        description={`Withdraw your accrued ${earningsDescription}. Track pending and completed payouts.`}
        actions={
          <Button onClick={() => setDialogOpen(true)} disabled={!entityId || totals.withdrawable <= 0}>
            <Send className="h-4 w-4" /> Request payout
          </Button>
        }
      />

      {/* StatTiles — gross / net accrued / paid / withdrawable. NO commission shown. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Gross earnings" value={formatCurrency(totals.gross)} icon={TrendingUp} tone="info" />
        <StatTile label="Net earnings" value={formatCurrency(totals.net)} icon={Wallet} tone="success" />
        <StatTile label="Paid out" value={formatCurrency(totals.paidNet)} icon={CheckCircle2} tone="success" />
        <StatTile label="Withdrawable" value={formatCurrency(totals.withdrawable)} icon={Banknote} tone="warning" />
      </div>

      <Alert className="border-emerald-200 bg-emerald-50">
        <Info className="h-4 w-4 text-emerald-600" />
        <AlertDescription className="text-emerald-800 text-sm">
          Your earnings are settled net of all platform processing. Available balance of{" "}
          <span className="font-bold">{formatCurrency(totals.withdrawable)}</span> can be withdrawn at any time — payouts
          are processed within 5 business days.
        </AlertDescription>
      </Alert>

      {/* Pending settlements (gross + net + status only — no commission) */}
      <SectionCard
        title="Accrued settlements"
        icon={CalendarDays}
        action={<span className="text-xs text-muted-foreground">{settlements.length} period(s)</span>}
        dense
      >
        {settlements.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title="No settlements yet"
              description="Your accrued earnings will appear here at the end of each billing cycle."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/40 max-h-96 overflow-y-auto">
            {settlements.map((s) => {
              const isPaid = s.status === "paid";
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.periodStart)} → {formatDate(s.periodEnd)}
                    </p>
                    <StatusBadge status={s.status} size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{s.settlementNumber}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(s.grossAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Net payout</p>
                      <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(s.netAmount)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Past payout requests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payout requests · {payouts.length} total
          </p>
        </div>

        <SegmentedControl
          options={FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            badge: counts[f.value] || undefined,
          }))}
          value={filter}
          onChange={setFilter}
          size="sm"
        />

        {filteredPayouts.length === 0 ? (
          <EmptyState
            icon={Send}
            title={filter === "all" ? "No payout requests yet" : `No ${filter} requests`}
            description="Tap “Request payout” to withdraw your accrued earnings."
            compact
          />
        ) : (
          <div className="space-y-2">
            {filteredPayouts.map((p) => {
              const status = p.status as PayoutStatus;
              const leadingIcon =
                status === "paid" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                status === "rejected" ? <Hourglass className="h-4 w-4 text-rose-600" /> :
                status === "processing" ? <Clock className="h-4 w-4 text-sky-600" /> :
                <Send className="h-4 w-4 text-amber-600" />;
              const leadingBg =
                status === "paid" ? "bg-emerald-50 ring-emerald-100" :
                status === "rejected" ? "bg-rose-50 ring-rose-100" :
                status === "processing" ? "bg-sky-50 ring-sky-100" :
                "bg-amber-50 ring-amber-100";
              return (
                <ExpandableCard
                  key={p.id}
                  leading={
                    <div className={`rounded-lg p-2 ring-1 ${leadingBg}`}>{leadingIcon}</div>
                  }
                  title={p.payoutNumber}
                  subtitle={`Requested ${formatDate(p.requestedAt)} · ${formatCurrency(p.amountRequested)}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-sm font-bold tabular-nums ${
                        status === "paid" ? "text-emerald-700" :
                        status === "rejected" ? "text-rose-700" :
                        status === "processing" ? "text-sky-700" :
                        "text-amber-700"
                      }`}>
                        {formatCurrency(p.amountRequested)}
                      </span>
                      <StatusBadge status={status} size="sm" />
                    </div>
                  }
                >
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Period</p>
                        <p className="text-xs font-medium mt-0.5">
                          {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Method</p>
                        <p className="text-xs font-medium mt-0.5 capitalize">
                          {p.method ? p.method.replace(/_/g, " ") : "Bank transfer"}
                        </p>
                      </div>
                    </div>
                    {p.notes && (
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Note</p>
                        <p className="text-xs leading-relaxed">{p.notes}</p>
                      </div>
                    )}
                    {p.adminNote && (
                      <div className="rounded-lg bg-amber-50 p-2.5 ring-1 ring-amber-100">
                        <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-1">Admin note</p>
                        <p className="text-xs leading-relaxed text-amber-800">{p.adminNote}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>Requested {formatDateTime(p.requestedAt)}</span>
                      {p.processedAt && <span>Processed {formatDateTime(p.processedAt)}</span>}
                    </div>
                  </div>
                </ExpandableCard>
              );
            })}
          </div>
        )}
      </div>

      <RequestPayoutDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entityType={entityType}
        entityId={entityId ?? ""}
        entityName={entityName}
        maxAmount={totals.withdrawable}
        submitting={submitting}
        onSubmit={async ({ amount, periodStart, periodEnd, notes }) => {
          if (!entityId) return;
          setSubmitting(true);
          try {
            const created = await payoutService.request({
              entityType,
              entityId,
              amountRequested: amount,
              periodStart,
              periodEnd,
              notes: notes || undefined,
              actorId: entityId,
            });
            toast.success("Payout requested", {
              description: `${created.payoutNumber} · ${formatCurrency(amount)} will be processed within 5 business days.`,
            });
            setDialogOpen(false);
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to submit payout request.");
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </div>
  );
}

interface RequestPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: PayoutEntityType;
  entityId: string;
  entityName: string;
  maxAmount: number;
  submitting: boolean;
  onSubmit: (data: { amount: number; periodStart: string; periodEnd: string; notes: string }) => Promise<void>;
}

function RequestPayoutDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  maxAmount,
  submitting,
  onSubmit,
}: RequestPayoutDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [amount, setAmount] = useState<string>(String(maxAmount || 0));
  const [periodStart, setPeriodStart] = useState<string>(monthAgo);
  const [periodEnd, setPeriodEnd] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setAmount(String(maxAmount || 0));
      setPeriodStart(monthAgo);
      setPeriodEnd(today);
      setNotes("");
    }
  }, [open]);

  const amountNum = Number(amount) || 0;
  const amountValid = amountNum > 0 && amountNum <= maxAmount;
  const periodValid = periodStart <= periodEnd;
  const canSubmit = amountValid && periodValid && !submitting && Boolean(entityId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request payout</DialogTitle>
          <DialogDescription>
            Withdraw accrued earnings for {entityName || `your ${entityType} account`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Available balance callout */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[10px] text-emerald-700 uppercase tracking-wider font-medium">
              Available to withdraw
            </p>
            <p className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
              {formatCurrency(maxAmount)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-amount">Amount (₦)</Label>
            <Input
              id="payout-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountNum > maxAmount && (
              <p className="text-xs text-rose-600">Amount exceeds available balance.</p>
            )}
            {amountNum <= 0 && amount !== "" && (
              <p className="text-xs text-rose-600">Enter an amount greater than zero.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="payout-start">Period start</Label>
              <Input
                id="payout-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-end">Period end</Label>
              <Input
                id="payout-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {!periodValid && (
            <p className="text-xs text-rose-600">Start date must be before end date.</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="payout-notes">Notes (optional)</Label>
            <Textarea
              id="payout-notes"
              rows={3}
              placeholder="Bank account, reference or instructions for the finance team…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                amount: amountNum,
                periodStart,
                periodEnd,
                notes,
              })
            }
          >
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
