"use client";

import type { PatientPaymentResponse } from "@royal-palace/contracts";
import { ChevronRight, CreditCard, Receipt } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MiniMetric } from "@/components/healthcare/metric-card";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { schedulingPaymentService } from "@/lib/services";

const PAGE_SIZE = 25;
const PAID_STATUSES = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);

export function PatientPayments() {
  const [payments, setPayments] = useState<PatientPaymentResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    if (nextCursor === undefined) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const page = await schedulingPaymentService.patientPayments({
        ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
        limit: PAGE_SIZE,
      });
      setPayments((current) =>
        nextCursor === undefined ? [...page.data] : [...current, ...page.data],
      );
      setCursor(page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payments could not be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const totals = useMemo(() => summarizePayments(payments), [payments]);

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" description="Your payment history." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MiniMetric label="Payment volume" value={formatGroupedTotal(totals.paid)} tone="success" />
        <MiniMetric label="Transactions shown" value={payments.length} tone="info" />
        <MiniMetric label="Refunded" value={formatGroupedTotal(totals.refunded)} tone="danger" />
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null && payments.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments yet"
          description="Your consultation, pharmacy, and laboratory payments will appear here."
        />
      ) : (
        <div className="space-y-3">
          {error !== null ? (
            <ErrorState message={error} onRetry={() => void load(cursor ?? undefined)} />
          ) : null}
          {payments.map((payment) => (
            <Card key={payment.id} className="transition-shadow hover:shadow-soft-md">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-xl bg-muted p-2">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{payment.reference}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(payment.createdAt)} · {paymentLabel(payment.purpose)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-base font-bold">
                      {formatMinorCurrency(payment.amountMinor, payment.currency)}
                    </p>
                    <StatusBadge status={payment.status.toLowerCase()} size="sm" />
                  </div>
                </div>
                {BigInt(payment.refundedAmountMinor) > BigInt(0) ? (
                  <p className="mt-2 text-right text-xs text-rose-700">
                    Refunded {formatMinorCurrency(payment.refundedAmountMinor, payment.currency)}
                  </p>
                ) : null}
                {payment.appointmentId !== null ? (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate("patient", "appointment", { id: payment.appointmentId! })
                      }
                    >
                      View appointment <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {cursor !== null ? (
            <div className="flex justify-center">
              <Button variant="outline" disabled={loadingMore} onClick={() => void load(cursor)}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function summarizePayments(payments: readonly PatientPaymentResponse[]) {
  const paid = new Map<string, bigint>();
  const refunded = new Map<string, bigint>();
  for (const payment of payments) {
    if (PAID_STATUSES.has(payment.status)) {
      paid.set(
        payment.currency,
        (paid.get(payment.currency) ?? BigInt(0)) + BigInt(payment.amountMinor),
      );
    }
    refunded.set(
      payment.currency,
      (refunded.get(payment.currency) ?? BigInt(0)) + BigInt(payment.refundedAmountMinor),
    );
  }
  return { paid, refunded };
}

function formatGroupedTotal(values: Map<string, bigint>): string {
  const nonZero = [...values.entries()].filter(([, amount]) => amount > BigInt(0));
  if (nonZero.length === 0) return "—";
  if (nonZero.length > 1) return `${nonZero.length} currencies`;
  const [currency, amount] = nonZero[0]!;
  return formatMinorCurrency(amount.toString(), currency);
}

function paymentLabel(purpose: PatientPaymentResponse["purpose"]): string {
  if (purpose === "PHARMACY_ORDER") return "Pharmacy order";
  if (purpose === "LABORATORY_BOOKING") return "Laboratory booking";
  return "Consultation";
}
