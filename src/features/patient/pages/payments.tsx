"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { paymentService } from "@/lib/services";
import type { Payment } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Receipt, ChevronRight, Download } from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

export function PatientPayments() {
  const { profile } = usePatientContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    paymentService.list(profile.id)
      .then((rows) => setPayments(rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const totalPaid = payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader title="Payments" description="Your payment history." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase">Total paid</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase">Transactions</p>
            <p className="mt-1 text-2xl font-bold">{payments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase">Refunds</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrency(payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <LoadingState label="Loading payments…" />
      ) : error ? (
        <EmptyState title="Could not load payments" description={error} />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Your consultation and order payments will appear here." />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card key={p.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2 shrink-0">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{p.paymentNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)} · {p.method}</p>
                  {p.reference && <p className="text-[10px] text-muted-foreground font-mono">Ref: {p.reference}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={
                      p.status === "successful" ? "bg-emerald-50 text-emerald-700 border-emerald-200 capitalize" :
                      p.status === "refunded" ? "bg-rose-50 text-rose-700 border-rose-200 capitalize" :
                      "bg-amber-50 text-amber-700 border-amber-200 capitalize"
                    }
                  >
                    {p.status}
                  </Badge>
                  <p className="font-bold text-sm w-24 text-right">{formatCurrency(p.amount)}</p>
                  {p.appointmentId && (
                    <Button size="sm" variant="outline" onClick={() => navigate("patient", "appointment", { id: p.appointmentId! })}>
                      View <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
