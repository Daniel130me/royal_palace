"use client";

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { CheckCircle2, Clock3, Coins, Undo2 } from "lucide-react";
import type { ManagerEarning } from "@/types";

type Response = { data: ManagerEarning[]; meta: { totals: Record<string, { amount: number; count: number }> } };
const labels: Record<string, string> = { consultation: "Consultation activity", pharmacy: "Pharmacy activity", laboratory: "Laboratory activity", hospital: "Hospital activity", patient_activity: "Patient activity" };

export function ManagerEarnings() {
  const [res, setRes] = useState<Response | null>(null); const [status, setStatus] = useState("all"); const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => managerService.earnings({ status, pageSize: "50" }).then((v) => setRes(v as unknown as Response)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load earnings.")), [status]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />; if (!res) return <LoadingState label="Loading earnings…" />;
  const totals = res.meta.totals;
  return <div><PageHeader title="Manager Earnings" description="Only your commission is shown. Patient identities, gross payments, organizations and commission calculations remain confidential." />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"><MetricCard label="Pending" value={formatCurrency(totals.pending?.amount ?? 0)} icon={Clock3} tone="warning" /><MetricCard label="Available" value={formatCurrency(totals.available?.amount ?? 0)} icon={Coins} tone="info" /><MetricCard label="Paid" value={formatCurrency(totals.paid?.amount ?? 0)} icon={CheckCircle2} tone="success" /><MetricCard label="Reversed" value={formatCurrency(totals.reversed?.amount ?? 0)} icon={Undo2} tone="danger" /></div>
    <div className="flex gap-2 mb-4 flex-wrap">{["all", "pending", "available", "paid", "reversed"].map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">{s}</Button>)}</div>
    <Card><CardContent className="p-0">{res.data.length ? res.data.map((e) => <div key={e.id} className="grid grid-cols-[1fr_auto_auto] gap-3 p-4 border-b last:border-0 items-center"><div><p className="font-medium">{e.earningNumber}</p><p className="text-xs text-muted-foreground">{labels[e.activityType ?? "patient_activity"]} · {formatDate(e.occurredAt)}</p></div><strong className={e.amount < 0 ? "text-rose-600" : "text-emerald-600"}>{formatCurrency(e.amount)}</strong><ManagerStatusBadge status={e.status} /></div>) : <p className="p-8 text-center text-sm text-muted-foreground">No earnings in this view.</p>}</CardContent></Card>
  </div>;
}
