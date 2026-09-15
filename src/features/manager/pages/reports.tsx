"use client";

// Reports page (plan §3.1/§3.2): month-over-month summary, a monthly
// payments-vs-earnings chart, the portfolio status table and a support
// summary. Everything comes from the /api/manager/dashboard aggregate —
// the page never recomputes business data beyond presentation deltas.

import { useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ManagerStatusBadge } from "../components/manager-shared";
import { navigate } from "@/lib/nav";
import { formatCurrency } from "@/lib/format";
import {
  BarChart3, Building2, CircleDollarSign, ClipboardList, Coins, LifeBuoy,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ManagerDashboardSummary } from "@/types";

export function ManagerReports() {
  const [data, setData] = useState<ManagerDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    managerService
      .dashboard()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load reports."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <LoadingState label="Preparing your reports…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const go = (page: string, params?: Record<string, string>) => navigate("manager", page, params);

  const monthly = data.monthly;
  const current = monthly[monthly.length - 1];
  const previous = monthly.length > 1 ? monthly[monthly.length - 2] : undefined;
  const label = (m?: { month: string }) =>
    m
    ? new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "—";

  const paymentsDelta = previous ? current.payments - previous.payments : 0;
  const earningsDelta = previous ? current.earnings - previous.earnings : 0;
  const deltaText = (delta: number) => {
    if (!previous) return "First month of data";
    const sign = delta >= 0 ? "+" : "−";
    const arrow = delta >= 0 ? "▲" : "▼";
    return `${arrow} ${sign}${formatCurrency(Math.abs(delta))} vs ${label(previous)}`;
  };

  const portfolioRows: { label: string; value: number; status?: string; onClick?: () => void }[] = [
    { label: "Active (verified)", value: data.portfolio.active, status: "approved", onClick: () => go("pharmacies", { verification: "approved" }) },
    { label: "Pending verification", value: data.portfolio.pendingVerification, status: "pending", onClick: () => go("pharmacies", { verification: "pending" }) },
    { label: "Inactive / other", value: data.portfolio.inactive, status: "draft" },
    { label: "Suspended", value: data.portfolio.suspended, status: "suspended" },
    { label: "Acquired by you (lifetime)", value: data.portfolio.acquiredByManager },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Month-over-month activity across your portfolio, earnings and support — generated from live data."
      />

      {/* Month-over-month summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Portfolio size"
          value={data.portfolio.total}
          hint={`${data.portfolio.pharmacies} pharmacies · ${data.portfolio.laboratories} laboratories`}
          icon={Building2}
        />
        <MetricCard
          label="Payments (this month)"
          value={formatCurrency(data.payments.successfulThisMonth)}
          hint={deltaText(paymentsDelta)}
          icon={CircleDollarSign}
          tone="info"
        />
        <MetricCard
          label="Manager Earnings (this month)"
          value={formatCurrency(data.earnings.thisMonth)}
          hint={deltaText(earningsDelta)}
          icon={Coins}
          tone="success"
          onClick={() => go("earnings")}
        />
        <MetricCard
          label="Pending applications"
          value={data.applications.pending}
          hint="Waiting for your attention"
          icon={ClipboardList}
          tone="warning"
          onClick={() => go("applications")}
        />
      </div>

      {/* Monthly chart */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Monthly payments vs Manager Earnings</CardTitle>
          <CardDescription>Last 6 months · organization payments to Royal Palace and your revenue share</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly.map((m) => ({ ...m, label: m.month.slice(2) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={38} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="payments" name="Payments" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="earnings" name="Earnings" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Payments shown are successful organization payments for your portfolio; earnings are your revenue-share ledger entries for the same periods.
          </p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {/* Portfolio status table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Portfolio status</CardTitle>
            <CardDescription>Current verification breakdown of your managed organizations</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Status</TableHead>
                  <TableHead className="text-right pr-6">Organizations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioRows.map((r) => (
                  <TableRow
                    key={r.label}
                    className={r.onClick ? "cursor-pointer" : undefined}
                    onClick={r.onClick}
                  >
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-2">
                        {r.status ? <ManagerStatusBadge status={r.status} /> : null}
                        <span className={r.status ? "text-muted-foreground" : "font-medium"}>{r.label}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-6 font-semibold">{r.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Support summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-primary" /> Support summary</CardTitle>
            <CardDescription>First-level ticket flow across your portfolio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SummaryRow label="Open tickets" value={data.support.open} onClick={() => go("support", { view: "open" })} />
            <SummaryRow label="Awaiting your response" value={data.support.awaitingManager} onClick={() => go("support", { view: "open" })} />
            <SummaryRow label="Escalated to Royal Palace" value={data.support.escalated} onClick={() => go("support", { view: "escalated" })} />
            <SummaryRow label="Pending applications" value={data.applications.pending} onClick={() => go("applications")} />
            <SummaryRow label="Pending earnings (maturing)" value={data.earnings.pending} money onClick={() => go("earnings", { status: "pending" })} />
            <SummaryRow label="Available for payout" value={data.earnings.available} money onClick={() => go("payouts")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, onClick, money }: { label: string; value: number; onClick?: () => void; money?: boolean }) {
  const text = money ? formatCurrency(value) : String(value);
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors text-left">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{text}</span>
    </button>
  ) : (
    <div className="flex items-center justify-between px-2 py-1.5 -mx-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{text}</span>
    </div>
  );
}
