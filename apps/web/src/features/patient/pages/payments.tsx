"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { paymentService } from "@/lib/services";
import type { Payment } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MiniMetric } from "@/components/healthcare/metric-card";
import { CreditCard, Receipt, ChevronRight } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

export function PatientPayments() {
  const { profile } = usePatientContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    paymentService.list(profile.id)
      .then((rows) => { if (!cancelled) setPayments(rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load payments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const totalPaid = payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0);
  const refunds = payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" description="Your payment history." />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniMetric label="Total paid" value={formatCurrency(totalPaid)} tone="success" />
        <MiniMetric label="Transactions" value={payments.length} tone="info" />
        <MiniMetric label="Refunds" value={formatCurrency(refunds)} tone="danger" />
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Could not load payments" description={error} />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Your consultation and order payments will appear here." />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card key={p.id} className="hover:shadow-soft-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-muted p-2 shrink-0">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.paymentNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(p.createdAt)} · {p.method}</p>
                    {p.reference && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Ref: {p.reference}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="font-bold text-base">{formatCurrency(p.amount)}</p>
                    <StatusBadge status={p.status} size="sm" />
                  </div>
                </div>
                {p.appointmentId && (
                  <div className="mt-3 pt-3 border-t border-border/60">
                    <Button size="sm" variant="outline" onClick={() => navigate("patient", "appointment", { id: p.appointmentId! })}>
                      View appointment <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
