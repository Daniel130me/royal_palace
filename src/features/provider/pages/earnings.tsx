"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { settlementService, appointmentService } from "@/lib/services";
import type { Settlement, Appointment } from "@/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  SkeletonGrid,
  ErrorState,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard, CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import { Wallet, TrendingUp, Calendar, Receipt, Download, Banknote, Coins } from "lucide-react";
import { toast } from "sonner";

type Tab = "all" | "paid" | "pending";

export function ProviderEarnings() {
  const { providerId } = useProviderContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

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

  const filteredSettlements = useMemo(() => {
    if (tab === "paid") return settlements.filter((s) => s.status === "paid");
    if (tab === "pending") return settlements.filter((s) => s.status === "pending");
    return settlements;
  }, [settlements, tab]);

  const paidCount = settlements.filter((s) => s.status === "paid").length;
  const pendingCount = settlements.filter((s) => s.status === "pending").length;

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
    <div className="space-y-5">
      <PageHeader
        title="Earnings"
        description="Settlements and estimated payouts for your consultations."
        actions={
          <Button variant="outline" onClick={() => toast.info("Statement export", { description: "Your full statement is being prepared — a download link will be emailed to you." })}>
            <Download className="h-4 w-4 mr-1" /> Export statement
          </Button>
        }
      />

      {/* Stat tiles row — Today / Week / Settled / Pending */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTileInline
          label="Today"
          value={formatCurrency(todayEarnings)}
          icon={Wallet}
          tone="text-emerald-600"
          hint="Est. 73% share"
        />
        <StatTileInline
          label="This week"
          value={formatCurrency(weekEarnings)}
          icon={TrendingUp}
          tone="text-emerald-600"
          hint={`Since ${formatDate(weekAgo)}`}
        />
        <StatTileInline
          label="Settled"
          value={formatCurrency(settledTotal)}
          icon={Receipt}
          tone="text-sky-600"
          hint={`${paidCount} settlement(s)`}
        />
        <StatTileInline
          label="Pending payout"
          value={formatCurrency(pendingSettlements)}
          icon={Calendar}
          tone="text-amber-600"
          hint={`${pendingCount} settlement(s)`}
        />
      </div>

      {/* Settlement list with SegmentedControl */}
      <div>
        <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-3">
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: "all", label: "All", badge: settlements.length || undefined },
              { value: "paid", label: "Paid", badge: paidCount || undefined },
              { value: "pending", label: "Pending", badge: pendingCount || undefined },
            ]}
          />
        </div>

        {filteredSettlements.length === 0 ? (
          <EmptyState icon={Receipt} title="No settlements" description="Your settlements will appear here after the first payout cycle." compact />
        ) : (
          <div className="space-y-2.5">
            {filteredSettlements.map((s) => (
              <ExpandableCard
                key={s.id}
                title={s.settlementNumber}
                subtitle={`${formatDate(s.periodStart)} → ${formatDate(s.periodEnd)} · ${relativeDay(s.periodEnd)}`}
                leading={
                  <div className={`rounded-xl p-2 ${s.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    <Receipt className="h-4 w-4" />
                  </div>
                }
                trailing={<StatusBadge status={s.status} size="sm" />}
              >
                <div className="grid grid-cols-3 gap-2 text-xs">
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
              </ExpandableCard>
            ))}
          </div>
        )}
      </div>

      {/* Activity summary + Payout schedule (compact) */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SectionCard title="Activity summary" icon={TrendingUp} dense contentClassName="p-0">
          <div className="divide-y divide-border/40">
            <CompactListItem title="Total consultations" subtitle="All appointments" trailing={<span className="font-semibold text-sm tabular-nums">{appointments.length}</span>} />
            <CompactListItem title="Completed & paid" subtitle="Eligible for payout" trailing={<span className="font-semibold text-sm tabular-nums text-emerald-700">{paidAppointments.length}</span>} />
            <CompactListItem title="Gross billed" subtitle="Total consultation fees" trailing={<span className="font-semibold text-sm tabular-nums">{formatCurrency(paidAppointments.reduce((s, a) => s + a.price, 0))}</span>} />
            <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/40">
              <span className="text-xs text-muted-foreground">Est. provider share (73%)</span>
              <span className="font-bold text-sm text-emerald-700 tabular-nums">{formatCurrency(allTimeEstimated)}</span>
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
  );
}

/* Inline stat tile with hint — denser than MetricCard for the earnings overview. */
function StatTileInline({ label, value, icon: Icon, tone, hint }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
          <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-tight leading-none ${tone}`}>{value}</p>
          <p className="mt-1 text-[10px] text-muted-foreground truncate leading-tight">{hint}</p>
        </div>
        <div className="rounded-lg bg-muted p-1.5 shrink-0">
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
      </div>
    </div>
  );
}
