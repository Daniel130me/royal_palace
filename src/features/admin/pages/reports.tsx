"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService, providerService, settlementService, pharmacyOrderService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Appointment, Provider, Settlement, PharmacyOrder, Payment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { BarChart3, TrendingUp, Users, Stethoscope, Activity } from "lucide-react";

const CATEGORY_COLORS = ["#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e"];

export function AdminReports() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      appointmentService.list(),
      providerService.list(),
      settlementService.list(),
      pharmacyOrderService.list(),
      resource.list<Payment>("payment"),
    ])
      .then(([a, p, s, o, pay]) => {
        setAppts(a);
        setProviders(p);
        setSettlements(s);
        setOrders(o);
        setPayments(pay);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Consultations over time (last 14 days)
  const consultsOverTime = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      days.push({ date: ds, label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), count: 0 });
    }
    for (const a of appts) {
      const found = days.find((d) => d.date === a.date);
      if (found) found.count += 1;
    }
    return days;
  }, [appts]);

  // Revenue by entity type (from settlements)
  const revenueByType = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const s of settlements) {
      const entry = map.get(s.entityType) ?? { name: s.entityType.charAt(0).toUpperCase() + s.entityType.slice(1), value: 0 };
      entry.value += s.commissionAmount;
      map.set(s.entityType, entry);
    }
    return Array.from(map.values());
  }, [settlements]);

  // Top providers by appointments
  const topProviders = useMemo(() => {
    const map = new Map<string, { id: string; name: string; specialty: string; appointments: number; revenue: number }>();
    for (const a of appts) {
      const p = providers.find((x) => x.id === a.providerId);
      if (!p) continue;
      const entry = map.get(p.id) ?? { id: p.id, name: `${p.title} ${p.firstName} ${p.lastName}`, specialty: p.specialty, appointments: 0, revenue: 0 };
      entry.appointments += 1;
      if (a.paymentStatus === "paid") entry.revenue += a.price;
      map.set(p.id, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.appointments - a.appointments).slice(0, 5);
  }, [appts, providers]);

  // Payments trend (cumulative)
  const paymentsTrend = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      days.push({ date: ds, label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), total: 0 });
    }
    for (const p of payments) {
      const ds = new Date(p.createdAt).toISOString().slice(0, 10);
      const found = days.find((d) => d.date === ds);
      if (found && p.status === "successful") found.total += p.amount;
    }
    let cum = 0;
    return days.map((d) => { cum += d.total; return { ...d, cumulative: cum }; });
  }, [payments]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appts) {
      map.set(a.status, (map.get(a.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [appts]);

  const totalRevenue = settlements.reduce((s, x) => s + x.commissionAmount, 0);
  const totalGMV = payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0);
  const avgTicket = payments.length ? totalGMV / payments.length : 0;

  if (loading) return <LoadingState label="Loading reports…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Reports & Insights"
        description="High-level platform trends derived from live data."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Reports" }]}
      />

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Gross Txn Value</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalGMV)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Activity className="h-3 w-3" /> Platform Revenue</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(totalRevenue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Users className="h-3 w-3" /> Avg Ticket</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(avgTicket)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Top Provider Apps</p>
          <p className="text-2xl font-bold mt-1">{topProviders[0]?.appointments ?? 0}</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Consultations over time */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Consultations (last 14 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={consultsOverTime} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cumulative payments */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Cumulative payments (14d)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={paymentsTrend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="cumulative" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Revenue by entity type */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Commission revenue by entity</CardTitle></CardHeader>
          <CardContent>
            {revenueByType.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No settlement data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={revenueByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry) => `${entry.name}`}>
                    {revenueByType.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Appointment status distribution */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Appointment status mix</CardTitle></CardHeader>
          <CardContent>
            {statusDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No appointment data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={statusDistribution} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top providers */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Top providers</CardTitle></CardHeader>
        <CardContent className="p-0">
          {topProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No provider activity yet.</p>
          ) : (
            <div className="divide-y">
              {topProviders.map((p, i) => (
                <div key={p.id} className="flex items-center gap-4 p-4">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.specialty}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{p.appointments} appts</p>
                    <p className="text-xs text-emerald-700">{formatCurrency(p.revenue)} paid</p>
                  </div>
                  <div className="hidden sm:block w-32">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(p.appointments / (topProviders[0]?.appointments || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {appts.length === 0 && orders.length === 0 && payments.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={BarChart3} title="No data available yet" description="Reports will populate as the platform processes transactions." />
        </div>
      )}
    </div>
  );
}
