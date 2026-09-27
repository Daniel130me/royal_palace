"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/nav";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { BarChart3, Bell, ClipboardList, Coins, Hospital, LifeBuoy, Link2, UserRound, Wallet } from "lucide-react";
import type { ManagerDashboardSummary, Notification } from "@/types";

type Payload = ManagerDashboardSummary & { notifications: Notification[]; manager: { id: string; managerNumber: string; onboardingCode: string; name: string } };

export function ManagerDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { managerService.dashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard.")); }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <LoadingState label="Loading your dashboard…" />;
  const go = (page: string) => navigate("manager", page);
  return <div>
    <PageHeader title={`Welcome, ${data.manager.name.split(" ")[0]}`} description={`Manager ID ${data.manager.managerNumber} · Referral activity and earnings. No patient or organization private data is displayed.`} actions={<Button onClick={() => go("onboard")}><Link2 className="h-4 w-4" />Enrollment links</Button>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard label="Total enrollments" value={data.enrollments.total} hint={`${data.enrollments.patients} patients · ${data.enrollments.hospitals} hospitals`} icon={UserRound} />
      <MetricCard label="Pending admin review" value={data.enrollments.pendingReview} hint="Admin handles all decisions" icon={ClipboardList} tone="warning" onClick={() => go("applications")} />
      <MetricCard label="Earnings this month" value={formatCurrency(data.earnings.thisMonth)} hint="Your commission only" icon={Coins} tone="success" onClick={() => go("earnings")} />
      <MetricCard label="Available for payout" value={formatCurrency(data.payouts.availableBalance)} icon={Wallet} tone="info" onClick={() => go("payouts")} />
    </div>
    <div className="grid md:grid-cols-3 gap-3 mt-4">
      <Card><CardHeader><CardTitle className="text-sm">Enrollment mix</CardTitle><CardDescription>Counts only; records remain private</CardDescription></CardHeader><CardContent className="space-y-2 text-sm"><Row label="Patients" value={data.enrollments.patients} /><Row label="Pharmacies" value={data.enrollments.pharmacies} /><Row label="Laboratories" value={data.enrollments.laboratories} /><Row label="Hospitals" value={data.enrollments.hospitals} icon={<Hospital className="h-4 w-4" />} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Earnings</CardTitle><CardDescription>No underlying patient payments shown</CardDescription></CardHeader><CardContent className="space-y-2 text-sm"><Row label="Pending" value={formatCurrency(data.earnings.pending)} /><Row label="Available" value={formatCurrency(data.earnings.available)} /><Row label="Paid" value={formatCurrency(data.earnings.paid)} /><Row label="Reversed" value={formatCurrency(data.earnings.reversed)} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex gap-2"><LifeBuoy className="h-4 w-4" />Ticket follow-up</CardTitle><CardDescription>Reference-level information only</CardDescription></CardHeader><CardContent className="space-y-2 text-sm"><Row label="Open" value={data.support.open} /><Row label="Awaiting follow-up" value={data.support.awaitingManager} /><Row label="Escalated" value={data.support.escalated} /></CardContent></Card>
    </div>
    <Card className="mt-4"><CardHeader><CardTitle className="text-sm flex gap-2"><BarChart3 className="h-4 w-4" />Monthly earnings</CardTitle><CardDescription>Your commission totals for the last six months</CardDescription></CardHeader><CardContent><div className="h-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(value: number) => formatCurrency(value)} /><Area dataKey="earnings" stroke="#10b981" fill="#10b981" fillOpacity={0.14} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
    <Card className="mt-4"><CardHeader><CardTitle className="text-sm flex gap-2"><Bell className="h-4 w-4" />Recent updates</CardTitle></CardHeader><CardContent className="space-y-2">{data.notifications.length ? data.notifications.map((n) => <div key={n.id} className="border rounded-lg p-3"><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground">{n.body} · {formatDateTime(n.createdAt)}</p></div>) : <p className="text-sm text-muted-foreground">No updates yet.</p>}</CardContent></Card>
  </div>;
}

function Row({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) { return <div className="flex justify-between"><span className="text-muted-foreground flex gap-1">{icon}{label}</span><strong>{value}</strong></div>; }
