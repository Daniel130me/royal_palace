"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { settlementService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Settlement } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Wallet, Search, Stethoscope, Pill, FlaskConical, Truck, CheckCircle2 } from "lucide-react";

const ENTITY_TYPES = [
  { value: "all", label: "All entities" },
  { value: "provider", label: "Providers", icon: Stethoscope },
  { value: "pharmacy", label: "Pharmacies", icon: Pill },
  { value: "laboratory", label: "Laboratories", icon: FlaskConical },
  { value: "logistics", label: "Logistics", icon: Truck },
];

export function AdminSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    settlementService.list()
      .then(setSettlements)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load settlements"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return settlements
      .filter((s) => {
        if (typeFilter !== "all" && s.entityType !== typeFilter) return false;
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (!q) return true;
        return `${s.settlementNumber} ${s.entityName} ${s.entityId}`.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
  }, [settlements, typeFilter, statusFilter, search]);

  const totalGross = filtered.reduce((s, x) => s + x.grossAmount, 0);
  const totalCommission = filtered.reduce((s, x) => s + x.commissionAmount, 0);
  const totalNet = filtered.reduce((s, x) => s + x.netAmount, 0);
  const pendingCount = settlements.filter((s) => s.status === "pending").length;

  const markPaid = async (id: string) => {
    setMarkingId(id);
    try {
      await resource.update<Settlement>("settlement", id, { status: "paid" });
      toast.success("Settlement marked as paid.");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update settlement.");
    } finally {
      setMarkingId(null);
    }
  };

  if (loading) return <LoadingState label="Loading settlements…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Settlements"
        description="Track gross transactions, platform commission and net payouts to providers, pharmacies, laboratories and logistics partners."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Settlements" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Gross" value={formatCurrency(totalGross)} icon={Wallet} tone="success" />
        <MetricCard label="Total Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="success" />
        <MetricCard label="Total Net Payouts" value={formatCurrency(totalNet)} icon={Wallet} tone="info" />
        <MetricCard label="Pending Payouts" value={pendingCount} icon={CheckCircle2} tone={pendingCount > 0 ? "warning" : "default"} />
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Settlement no, entity name…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entity type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No settlements found" description="Try adjusting filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Settlement</th>
                  <th className="text-left p-3">Entity</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Period</th>
                  <th className="text-right p-3">Gross</th>
                  <th className="text-right p-3">Commission</th>
                  <th className="text-right p-3">Net</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <p className="font-medium">{s.settlementNumber}</p>
                      <p className="text-xs text-muted-foreground">{s.entityId}</p>
                    </td>
                    <td className="p-3 font-medium">{s.entityName}</td>
                    <td className="p-3 capitalize">{s.entityType}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</td>
                    <td className="p-3 text-right">{formatCurrency(s.grossAmount)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatCurrency(s.commissionAmount)}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(s.netAmount)}</td>
                    <td className="p-3"><StatusBadge status={s.status} /></td>
                    <td className="p-3 text-right">
                      {s.status === "pending" ? (
                        <Button size="sm" variant="outline" disabled={markingId === s.id} onClick={() => void markPaid(s.id)}>
                          {markingId === s.id ? "Marking…" : "Mark as paid"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td colSpan={4} className="p-3 text-right text-xs uppercase text-muted-foreground">Filtered total</td>
                  <td className="p-3 text-right">{formatCurrency(totalGross)}</td>
                  <td className="p-3 text-right text-emerald-700">{formatCurrency(totalCommission)}</td>
                  <td className="p-3 text-right">{formatCurrency(totalNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
