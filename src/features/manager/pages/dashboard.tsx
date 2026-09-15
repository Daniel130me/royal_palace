"use client";

// Manager Portal dashboard (plan §3.2). Every number comes from the
// /api/manager/dashboard aggregate payload — no client-side recomputation.
// Cards representing lists navigate to their filtered destination.

import { useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/nav";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatRateBps } from "@/lib/manager-constants";
import {
  Building2, FlaskConical, Handshake, Coins, Wallet, LifeBuoy, ClipboardList,
  ArrowRight, Bell, CircleDollarSign, BarChart3,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ManagerDashboardSummary, Notification } from "@/types";

type DashboardPayload = ManagerDashboardSummary & {
  notifications: Notification[];
  manager: { id: string; managerNumber: string; onboardingCode: string; name: string };
};

export function ManagerDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    managerService
      .dashboard()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load dashboard."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const go = (page: string, params?: Record<string, string>) => navigate("manager", page, params);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${data.manager.name.split(" ")[0]}`}
        description={`Manager ID ${data.manager.managerNumber} · Portfolio, earnings and support at a glance.`}
      />

      {/* Portfolio summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Managed organizations"
          value={data.portfolio.total}
          hint={`${data.portfolio.pharmacies} pharmacies · ${data.portfolio.laboratories} laboratories`}
          icon={Building2}
          onClick={() => go("pharmacies")}
        />
        <MetricCard
          label="Acquired by you"
          value={data.portfolio.acquiredByManager}
          hint="Organizations you brought onto the platform"
          icon={Handshake}
          tone="violet"
        />
        <MetricCard
          label="Successful payments (month)"
          value={formatCurrency(data.payments.successfulThisMonth)}
          hint={`${data.payments.countThisMonth} organization payment${data.payments.countThisMonth === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
          tone="info"
        />
        <MetricCard
          label="Manager Earnings (month)"
          value={formatCurrency(data.earnings.thisMonth)}
          hint="Revenue share generated this month"
          icon={Coins}
          tone="success"
          onClick={() => go("earnings")}
        />
      </div>

      {/* Earnings + payout + support breakdown */}
      <div className="grid md:grid-cols-3 gap-3 sm:gap-4 mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Manager Earnings</CardTitle>
            <CardDescription>Ledger status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Pending (maturing)" value={formatCurrency(data.earnings.pending)} onClick={() => go("earnings", { status: "pending" })} />
            <Row label="Available" value={formatCurrency(data.earnings.available)} onClick={() => go("earnings", { status: "available" })} />
            <Row label="Paid out" value={formatCurrency(data.earnings.paid)} onClick={() => go("earnings", { status: "paid" })} />
            <Row label="Reversed" value={formatCurrency(data.earnings.reversed)} onClick={() => go("earnings", { status: "reversed" })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Payouts</CardTitle>
            <CardDescription>Available balance and requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Available balance" value={formatCurrency(data.payouts.availableBalance)} strong />
            <Row label="Awaiting processing" value={formatCurrency(data.payouts.pendingPayout)} onClick={() => go("payouts")} />
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => go("payouts")}>
              Request a payout <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-primary" /> Support</CardTitle>
            <CardDescription>First-level tickets in your portfolio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Open tickets" value={String(data.support.open)} onClick={() => go("support", { view: "open" })} />
            <Row label="Awaiting your response" value={String(data.support.awaitingManager)} onClick={() => go("support", { view: "open" })} />
            <Row label="Escalated to Royal Palace" value={String(data.support.escalated)} onClick={() => go("support", { view: "escalated" })} />
            <Row
              label="Pending applications"
              value={String(data.applications.pending)}
              onClick={() => go("applications")}
              icon={<ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />}
            />
          </CardContent>
        </Card>
      </div>

      {/* Portfolio status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <MetricCard label="Active organizations" value={data.portfolio.active} icon={Building2} onClick={() => go("pharmacies", { verification: "approved" })} />
        <MetricCard label="Pending verification" value={data.portfolio.pendingVerification} icon={ClipboardList} tone="warning" onClick={() => go("pharmacies", { verification: "pending" })} />
        <MetricCard label="Laboratories" value={data.portfolio.laboratories} icon={FlaskConical} onClick={() => go("laboratories")} />
        <MetricCard label="Pharmacies" value={data.portfolio.pharmacies} icon={Building2} onClick={() => go("pharmacies")} />
      </div>

      {/* Monthly chart */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Payments & Manager Earnings — last 6 months</CardTitle>
          <CardDescription>Organization payments to Royal Palace and your revenue share</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthly.map((m) => ({ ...m, label: m.month.slice(2) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={38} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="payments" name="Payments" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="earnings" name="Earnings" stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent notifications */}
      <Card className="mt-4">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Recent activity</CardTitle>
            <CardDescription>Latest notifications for your portfolio</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => go("notifications")}>View all</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            data.notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(n.createdAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, onClick, strong, icon }: { label: string; value: string; onClick?: () => void; strong?: boolean; icon?: React.ReactNode }) {
  const content = (
    <>
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className={strong ? "font-bold" : "font-semibold"}>{value}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center justify-between hover:text-primary transition-colors text-left">{content}</button>
  ) : (
    <div className="flex items-center justify-between">{content}</div>
  );
}
