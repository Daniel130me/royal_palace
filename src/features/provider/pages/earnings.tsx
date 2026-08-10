"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { settlementService, appointmentService } from "@/lib/services";
import type { Settlement, Appointment } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  SkeletonGrid,
  ErrorState,
} from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import { Wallet, TrendingUp, Calendar, Receipt, Download, Banknote, Coins } from "lucide-react";
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

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Earnings" description="Settlements and estimated payouts for your consultations." />
        <SkeletonGrid count={4} />
      </div>
    );
  }
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

      {/* Primary metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Today" value={formatCurrency(todayEarnings)} icon={Wallet} tone="success" hint="Est. 73% of paid consultations" />
        <MetricCard label="This week" value={formatCurrency(weekEarnings)} icon={TrendingUp} tone="success" hint={`Since ${formatDate(weekAgo)}`} />
        <MetricCard label="Settled (paid)" value={formatCurrency(settledTotal)} icon={Receipt} tone="info" hint={`${settlements.filter((s) => s.status === "paid").length} settlement(s)`} />
        <MetricCard label="Pending payout" value={formatCurrency(pendingSettlements)} icon={Calendar} tone="warning" hint={`${settlements.filter((s) => s.status === "pending").length} settlement(s)`} />
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MiniMetric label="Total consultations" value={appointments.length} tone="info" />
        <MiniMetric label="Completed & paid" value={paidAppointments.length} tone="success" />
        <MiniMetric label="All-time est." value={formatCurrency(allTimeEstimated)} tone="violet" />
        <MiniMetric label="Settlement count" value={settlements.length} tone="default" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <SectionCard
            title="Settlement history"
            icon={Receipt}
            description="All settled payouts to your account"
          >
            {settlements.length === 0 ? (
              <EmptyState icon={Receipt} title="No settlements yet" description="Your first settlement will appear here after the first payout cycle." compact />
            ) : (
              <div className="space-y-3">
                {settlements.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/80 bg-card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{s.settlementNumber}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Period: {formatDate(s.periodStart)} → {formatDate(s.periodEnd)} · {relativeDay(s.periodEnd)}
                        </p>
                      </div>
                      <StatusBadge status={s.status} size="sm" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Gross</p>
                        <p className="font-semibold mt-0.5">{formatCurrency(s.grossAmount)}</p>
                      </div>
                      <div className="rounded-lg bg-rose-50 p-2">
                        <p className="text-rose-600 text-[10px] uppercase tracking-wider">Platform fee</p>
                        <p className="font-semibold text-rose-700 mt-0.5">−{formatCurrency(s.commissionAmount)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2">
                        <p className="text-emerald-600 text-[10px] uppercase tracking-wider">Net payout</p>
                        <p className="font-semibold text-emerald-700 mt-0.5">{formatCurrency(s.netAmount)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Activity summary" icon={TrendingUp}>
            <div className="text-sm space-y-2.5">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Total consultations</span><span className="font-semibold">{appointments.length}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Completed & paid</span><span className="font-semibold">{paidAppointments.length}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Gross billed</span><span className="font-semibold">{formatCurrency(paidAppointments.reduce((s, a) => s + a.price, 0))}</span></div>
              <div className="flex justify-between border-t border-border/60 pt-2.5 gap-2">
                <span className="text-muted-foreground">Est. provider share (73%)</span>
                <span className="font-bold text-emerald-700">{formatCurrency(allTimeEstimated)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Payout schedule" icon={Banknote}>
            <div className="text-xs space-y-2 text-muted-foreground leading-relaxed">
              <p>Settlements are calculated monthly and disbursed to your registered bank account within <span className="text-foreground font-medium">5 business days</span> of period end.</p>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                <span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" /> Commission rate</span>
                <span className="text-foreground font-semibold">27%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Provider payout share</span>
                <span className="text-foreground font-semibold">73%</span>
              </div>
              <p className="pt-2 border-t border-border/60">For dispute or reconciliation queries, contact <span className="text-foreground font-medium">finance@royalpalace.health</span>.</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
