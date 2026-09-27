"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { CalendarRange, Coins } from "lucide-react";
import type { ManagerDashboardSummary, ManagerEarning } from "@/types";

export function ManagerReports() {
  const [data, setData] = useState<ManagerDashboardSummary | null>(null); const [rows, setRows] = useState<ManagerEarning[]>([]); const [error, setError] = useState<string | null>(null); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  useEffect(() => { managerService.dashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports.")); }, []);
  const runCustom = async () => { try { const result = await managerService.earnings({ from, to, pageSize: "100" }); setRows(result.data); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load range."); } };
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />; if (!data) return <LoadingState label="Preparing earnings reports…" />;
  const customTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  return <div><PageHeader title="Earnings reports" description="Daily, monthly and custom-range views of your commission only." />
    <div className="grid grid-cols-2 gap-3"><MetricCard label="Today" value={formatCurrency(data.daily.at(-1)?.earnings ?? 0)} icon={Coins} tone="success" /><MetricCard label="This month" value={formatCurrency(data.earnings.thisMonth)} icon={CalendarRange} tone="info" /></div>
    <Card className="mt-4"><CardHeader><CardTitle className="text-sm">Daily earnings</CardTitle><CardDescription>Last seven days</CardDescription></CardHeader><CardContent><Chart data={data.daily} keyName="date" /></CardContent></Card>
    <Card className="mt-4"><CardHeader><CardTitle className="text-sm">Monthly earnings</CardTitle><CardDescription>Last six months</CardDescription></CardHeader><CardContent><Chart data={data.monthly} keyName="month" /></CardContent></Card>
    <Card className="mt-4"><CardHeader><CardTitle className="text-sm">Custom date range</CardTitle><CardDescription>Choose inclusive start and end dates</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2 items-end"><label className="text-xs">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><Button onClick={() => void runCustom()} disabled={!from || !to}>Generate</Button><strong className="ml-auto">Total: {formatCurrency(customTotal)}</strong></div></CardContent></Card>
  </div>;
}

function Chart({ data, keyName }: { data: { earnings: number; date?: string; month?: string }[]; keyName: "date" | "month" }) { return <div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={keyName} fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(value: number) => formatCurrency(value)} /><Bar dataKey="earnings" fill="#10b981" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>; }
