"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { settlementService, appointmentService } from "@/lib/services";
import type { Settlement, Appointment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay, fullName } from "@/lib/format";
import { Wallet, TrendingUp, Calendar, Receipt, Download } from "lucide-react";
import { toast } from "sonner";

export function ProviderEarnings() {
  const { providerId } = useProviderContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const [stls, appts] = await Promise.all([
        settlementService.list({ entityType: "provider", entityId: providerId }),
        appointmentService.list({ providerId }),
      ]);
      setSettlements(stls.sort((a, b) => b.periodStart.localeCompare(a.periodStart)));
      setAppointments(appts);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load earnings.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const paidAppointments = useMemo(
    () => appointments.filter((a) => a.status === "completed" && a.paymentStatus === "paid"),
    [appointments]
  );

  const todayEarnings = useMemo(
    () => paidAppointments.filter((a) => a.date === today).reduce((s, a) => s + Math.round(a.price * 0.73), 0),
    [paidAppointments, today]
  );
  const weekEarnings = useMemo(
    () => paidAppointments.filter((a) => a.date >= weekAgo).reduce((s, a) => s + Math.round(a.price * 0.73), 0),
    [paidAppointments, weekAgo]
  );
  const allTimeEstimated = useMemo(
    () => paidAppointments.reduce((s, a) => s + Math.round(a.price * 0.73), 0),
    [paidAppointments]
  );

  const settledTotal = useMemo(
    () => settlements.filter((s) => s.status === "paid").reduce((s, x) => s + x.netAmount, 0),
    [settlements]
  );
  const pendingSettlements = useMemo(
    () => settlements.filter((s) => s.status === "pending").reduce((s, x) => s + x.netAmount, 0),
    [settlements]
  );

  if (loading) return <LoadingState label="Loading earnings…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Earnings"
        description="Settlements and estimated payouts for your consultations."
        actions={
          <Button variant="outline" onClick={() => toast.info("Statement export", { description: "Your full statement is being prepared — a download link will be emailed to you." })}>
            <Download className="h-4 w-4 mr-1" /> Export statement
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Today" value={formatCurrency(todayEarnings)} icon={Wallet} tone="success" hint="Est. 73% of paid consultations" />
        <MetricCard label="This week" value={formatCurrency(weekEarnings)} icon={TrendingUp} tone="success" hint={`Since ${formatDate(weekAgo)}`} />
        <MetricCard label="Settled (paid)" value={formatCurrency(settledTotal)} icon={Receipt} tone="success" hint={`${settlements.filter((s) => s.status === "paid").length} settlement(s)`} />
        <MetricCard label="Pending payout" value={formatCurrency(pendingSettlements)} icon={Calendar} tone="warning" hint={`${settlements.filter((s) => s.status === "pending").length} settlement(s)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Settlement history</CardTitle>
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <EmptyState icon={Receipt} title="No settlements yet" description="Your first settlement will appear here after the first payout cycle." />
              ) : (
                <div className="space-y-3">
                  {settlements.map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.settlementNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            Period: {formatDate(s.periodStart)} → {formatDate(s.periodEnd)} · {relativeDay(s.periodEnd)}
                          </p>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Gross</p>
                          <p className="font-medium">{formatCurrency(s.grossAmount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Platform fee</p>
                          <p className="font-medium text-rose-600">−{formatCurrency(s.commissionAmount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Net payout</p>
                          <p className="font-medium text-emerald-700">{formatCurrency(s.netAmount)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Activity summary</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Total consultations</span><span className="font-medium">{appointments.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Completed & paid</span><span className="font-medium">{paidAppointments.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Gross billed</span><span className="font-medium">{formatCurrency(paidAppointments.reduce((s, a) => s + a.price, 0))}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Est. provider share (73%)</span><span className="font-medium text-emerald-700">{formatCurrency(allTimeEstimated)}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Payout schedule</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <p>Settlements are calculated monthly and disbursed to your registered bank account within 5 business days of period end.</p>
              <p className="text-foreground font-medium">Commission rate: 27%</p>
              <p>Provider payout share: 73% of the consultation price.</p>
              <p className="pt-2 border-t">For dispute or reconciliation queries, contact <span className="text-foreground">finance@royalpalace.health</span>.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
