"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { settlementService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Settlement } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Wallet, Search, Stethoscope, Pill, FlaskConical, Truck, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeFilterCount = (typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlements"
        description="Track gross transactions, platform commission and net payouts to providers, pharmacies, laboratories and logistics partners."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Settlements" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total Gross" value={formatCurrency(totalGross)} icon={Wallet} tone="success" />
        <MetricCard label="Total Commission" value={formatCurrency(totalCommission)} icon={Wallet} tone="success" />
        <MetricCard label="Total Net Payouts" value={formatCurrency(totalNet)} icon={Wallet} tone="info" />
        <MetricCard label="Pending Payouts" value={pendingCount} icon={CheckCircle2} tone={pendingCount > 0 ? "warning" : "default"} />
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Settlement no, entity name…" className="pl-9" />
        </div>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filters" className="relative">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Mobile collapsible filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
        <CollapsibleContent>
          <SectionCard title="Filters" icon={SlidersHorizontal}>
            <div className="space-y-3">
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
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* Desktop inline filters */}
      <div className="hidden lg:block">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
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
        </SectionCard>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No settlements found" description="Try adjusting filters." />
      ) : (
        <SectionCard dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.settlementNumber}</p>
                      <p className="text-xs text-muted-foreground">{s.entityId}</p>
                    </TableCell>
                    <TableCell className="font-medium">{s.entityName}</TableCell>
                    <TableCell className="capitalize">{s.entityType}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.grossAmount)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatCurrency(s.commissionAmount)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(s.netAmount)}</TableCell>
                    <TableCell><StatusBadge status={s.status} size="sm" /></TableCell>
                    <TableCell className="text-right">
                      {s.status === "pending" ? (
                        <Button size="sm" variant="outline" disabled={markingId === s.id} onClick={() => void markPaid(s.id)}>
                          {markingId === s.id ? "Marking…" : "Mark as paid"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td colSpan={4} className="p-3 text-right text-xs uppercase text-muted-foreground">Filtered total</td>
                  <td className="p-3 text-right">{formatCurrency(totalGross)}</td>
                  <td className="p-3 text-right text-emerald-700">{formatCurrency(totalCommission)}</td>
                  <td className="p-3 text-right">{formatCurrency(totalNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {filtered.map((s) => (
              <li key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{s.settlementNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.entityName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{s.entityType}</p>
                  </div>
                  <StatusBadge status={s.status} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{formatDate(s.periodStart)} → {formatDate(s.periodEnd)}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Gross</p>
                    <p className="font-medium mt-0.5">{formatCurrency(s.grossAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Commission</p>
                    <p className="font-medium text-emerald-700 mt-0.5">{formatCurrency(s.commissionAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Net</p>
                    <p className="font-bold mt-0.5">{formatCurrency(s.netAmount)}</p>
                  </div>
                </div>
                {s.status === "pending" && (
                  <Button size="sm" variant="outline" className="w-full mt-3" disabled={markingId === s.id} onClick={() => void markPaid(s.id)}>
                    {markingId === s.id ? "Marking…" : "Mark as paid"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
