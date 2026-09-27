"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { settlementService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Settlement } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Wallet, Search, Stethoscope, Pill, FlaskConical, Truck, CheckCircle2, Hourglass, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ENTITY_TYPES = [
  { value: "all", label: "All", icon: Wallet },
  { value: "provider", label: "Providers", icon: Stethoscope },
  { value: "pharmacy", label: "Pharmacies", icon: Pill },
  { value: "laboratory", label: "Laboratories", icon: FlaskConical },
  { value: "logistics", label: "Logistics", icon: Truck },
];

type StatusFilter = "all" | "pending" | "paid";

export function AdminSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const paidCount = settlements.filter((s) => s.status === "paid").length;

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settlements"
        description="Track gross, commission and net payouts across partners."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Settlements" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total Gross" value={formatCurrency(totalGross)} icon={Wallet} tone="success" />
        <StatTile label="Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="info" />
        <StatTile label="Net payouts" value={formatCurrency(totalNet)} icon={Wallet} tone="success" />
        <StatTile label="Pending" value={pendingCount} icon={Hourglass} tone="warning" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Settlement no, entity name…" className="pl-9" />
      </div>

      {/* SegmentedControl status filter */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: settlements.length },
          { value: "pending" as StatusFilter, label: "Pending", badge: pendingCount },
          { value: "paid" as StatusFilter, label: "Paid", badge: paidCount },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
        size="sm"
      />

      {/* Entity type filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 lg:mx-0 lg:px-0">
        {ENTITY_TYPES.map((t) => {
          const Icon = t.icon;
          const active = typeFilter === t.value;
          const count = t.value === "all" ? settlements.length : settlements.filter((s) => s.entityType === t.value).length;
          return (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all tap-highlight-none ${
                active ? "bg-primary text-primary-foreground shadow-soft" : "bg-card border border-border/60 text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              <span className={`text-[10px] rounded-full px-1 ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Advanced filters (collapsible) */}
      {advancedOpen && (
        <SectionCard title="Advanced filters" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><SlidersHorizontal className="h-3 w-3" /> Entity type</Label>
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
              <Label className="text-xs flex items-center gap-1"><SlidersHorizontal className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      )}

      <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((v) => !v)}>
        {advancedOpen ? "Hide" : "Show"} advanced filters
      </Button>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No settlements found" description="Try adjusting filters." compact />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const entityIcon = ENTITY_TYPES.find((t) => t.value === s.entityType)?.icon ?? Wallet;
            const EntityIcon = entityIcon;
            return (
              <ExpandableCard
                key={s.id}
                leading={
                  <div className={s.status === "paid"
                    ? "rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"
                    : "rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"}>
                    <EntityIcon className={s.status === "paid" ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-amber-600"} />
                  </div>
                }
                title={s.settlementNumber}
                subtitle={`${s.entityName} · ${s.entityType} · ${formatDate(s.periodStart)} → ${formatDate(s.periodEnd)}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(s.netAmount)}</span>
                    <StatusBadge status={s.status} size="sm" />
                  </div>
                }
              >
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                      <p className="font-medium mt-0.5 tabular-nums">{formatCurrency(s.grossAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
                      <p className="font-medium text-emerald-700 mt-0.5 tabular-nums">{formatCurrency(s.commissionAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net</p>
                      <p className="font-bold mt-0.5 tabular-nums">{formatCurrency(s.netAmount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{s.entityId}</span>
                    {s.status === "pending" ? (
                      <Button size="sm" variant="outline" disabled={markingId === s.id} onClick={() => void markPaid(s.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {markingId === s.id ? "Marking…" : "Mark as paid"}
                      </Button>
                    ) : (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">Paid</span>
                    )}
                  </div>
                </div>
              </ExpandableCard>
            );
          })}

          {/* Filtered totals footer */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Gross</p>
              <p className="font-medium tabular-nums">{formatCurrency(totalGross)}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Commission</p>
              <p className="font-medium text-emerald-700 tabular-nums">{formatCurrency(totalCommission)}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Net</p>
              <p className="font-bold tabular-nums">{formatCurrency(totalNet)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
