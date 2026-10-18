"use client";

import type { OrganizationFinanceComponents } from "@royal-palace/api-client";
import { Banknote, CalendarDays, Send, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { productionOrganizationFinanceService } from "@/lib/services";

type Period = OrganizationFinanceComponents["schemas"]["SettlementPeriod"];
type Payout = OrganizationFinanceComponents["schemas"]["Payout"];

export function OrganizationEarningsPage({
  organizationId,
  title,
  description,
}: {
  organizationId?: string;
  title: string;
  description: string;
}) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setError("No organization membership is available for this session.");
      setLoading(false);
      return;
    }
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    setLoading(true);
    try {
      const response = await productionOrganizationFinanceService.organization.report(
        organizationId,
        from.toISOString(),
        to.toISOString(),
        "MONTH",
      );
      setPeriods([...response.data]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Earnings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => void load(), [load]);
  const totals = useMemo(() => summarize(periods), [periods]);
  if (loading) return <LoadingState label="Loading organization earnings…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <div className="grid gap-3 sm:grid-cols-2">
        {totals.map((item) => (
          <Card key={item.currency}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Available · {item.currency}
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatMinorCurrency(item.available, item.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Earned {formatMinorCurrency(item.payable, item.currency)} · paid{" "}
                {formatMinorCurrency(item.paid, item.currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Organization earnings come only from verified eligible payments. Currencies are never
        combined; refunds and disputes place affected funds on reconciliation hold.
      </div>
      {periods.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No settled earnings yet"
          description="Verified eligible payments will appear here."
          compact
        />
      ) : (
        <div className="space-y-2">
          {periods.map((period) => (
            <Card key={`${period.currency}-${period.periodStart}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {period.earningCount} earning{period.earningCount === 1 ? "" : "s"} ·{" "}
                    {period.currency}
                  </p>
                </div>
                <p className="font-bold text-emerald-700">
                  {formatMinorCurrency(period.payableAmountMinor, period.currency)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrganizationPayoutsPage({
  organizationId,
  organizationLabel,
}: {
  organizationId?: string;
  organizationLabel: string;
}) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!organizationId) {
      setError("No organization membership is available for this session.");
      setLoading(false);
      return;
    }
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    setLoading(true);
    try {
      const [payoutPage, report] = await Promise.all([
        productionOrganizationFinanceService.organization.payouts(organizationId),
        productionOrganizationFinanceService.organization.report(
          organizationId,
          from.toISOString(),
          to.toISOString(),
          "TOTAL",
        ),
      ]);
      setPayouts([...payoutPage.data]);
      setPeriods([...report.data]);
      setCurrency((value) => value || report.data[0]?.currency || "");
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payouts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);
  useEffect(() => void load(), [load]);
  const balances = periods.map((period) => ({
    amount: period.availableAmountMinor,
    currency: period.currency,
  }));
  async function submit() {
    if (!organizationId || !currency) return;
    const minor = majorToMinor(amount, currency);
    if (!minor || BigInt(minor) <= BigInt(0)) {
      toast.error("Enter a valid payout amount.");
      return;
    }
    setBusy(true);
    try {
      await productionOrganizationFinanceService.organization.requestPayout(
        organizationId,
        { currency, requestedAmountMinor: minor },
        crypto.randomUUID(),
      );
      toast.success("Payout request submitted for finance review.");
      setOpen(false);
      setAmount("");
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Payout request failed.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <LoadingState label="Loading payouts…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Payouts"
        description={`Request withdrawal of available ${organizationLabel} earnings.`}
        actions={
          <Button
            onClick={() => setOpen(true)}
            disabled={balances.every((item) => BigInt(item.amount) <= BigInt(0))}
          >
            <Send className="h-4 w-4" /> Request payout
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {balances.map((item) => (
          <Card key={item.currency}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Available · {item.currency}
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatMinorCurrency(item.amount, item.currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Approval records an internal finance decision only. Automated bank transfer remains disabled
        until a payout provider and launch region are qualified.
      </div>
      {payouts.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No payout requests"
          description="Available same-currency earnings can be submitted for review."
          compact
        />
      ) : (
        <div className="space-y-2">
          {payouts.map((payout) => (
            <Card key={payout.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">{payout.payoutNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payout.requestedAt)} ·{" "}
                    {payout.status.toLowerCase().replaceAll("_", " ")}
                  </p>
                </div>
                <p className="font-bold">
                  {formatMinorCurrency(payout.requestedAmountMinor, payout.currency)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request payout</DialogTitle>
            <DialogDescription>
              Only available earnings can be reserved, in one currency per request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="organization-payout-currency">Currency</Label>
              <select
                id="organization-payout-currency"
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {balances.map((item) => (
                  <option key={item.currency} value={item.currency}>
                    {item.currency} · {formatMinorCurrency(item.amount, item.currency)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="organization-payout-amount">Amount</Label>
              <Input
                id="organization-payout-amount"
                className="mt-1"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarize(periods: Period[]) {
  const map = new Map<
    string,
    { available: string; currency: string; paid: string; payable: string }
  >();
  for (const period of periods) {
    const value = map.get(period.currency) ?? {
      available: "0",
      currency: period.currency,
      paid: "0",
      payable: "0",
    };
    value.available = (BigInt(value.available) + BigInt(period.availableAmountMinor)).toString();
    value.paid = (BigInt(value.paid) + BigInt(period.paidAmountMinor)).toString();
    value.payable = (BigInt(value.payable) + BigInt(period.payableAmountMinor)).toString();
    map.set(period.currency, value);
  }
  return [...map.values()];
}
function majorToMinor(value: string, currency: string): string | null {
  try {
    const digits =
      new Intl.NumberFormat(undefined, {
        currency,
        style: "currency",
      }).resolvedOptions().maximumFractionDigits ?? 2;
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(value.trim())) return null;
    const [whole = "0", fraction = ""] = value.trim().split(".");
    return (
      BigInt(whole) * BigInt(10) ** BigInt(digits) +
      BigInt(fraction.padEnd(digits, "0") || "0")
    ).toString();
  } catch {
    return null;
  }
}
