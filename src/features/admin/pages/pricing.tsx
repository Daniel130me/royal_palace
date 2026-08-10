"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { serviceService, pricingService, adminService } from "@/lib/services";
import type { Service, ServicePrice } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  Tag, Stethoscope, Smile, FlaskConical, Home, HeartPulse, Activity, Truck,
  Pencil, History, ArrowDownRight, ArrowUpRight, Calendar, Wallet, TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ADMIN_ACTOR_ID = "ADM-001";

const CATEGORIES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "consultation", label: "Consult", icon: Stethoscope },
  { key: "dental", label: "Dental", icon: Smile },
  { key: "laboratory", label: "Lab", icon: FlaskConical },
  { key: "home", label: "Home", icon: Home },
  { key: "preventive", label: "Prevent", icon: HeartPulse },
  { key: "chronic", label: "Chronic", icon: Activity },
  { key: "logistics", label: "Logistics", icon: Truck },
];

function activePrice(svc: Service): ServicePrice | undefined {
  return svc.prices?.find((p) => p.status === "active");
}

function priceHistory(svc: Service): ServicePrice[] {
  return [...(svc.prices ?? [])].sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
}

export function AdminPricing() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Service | null>(null);
  const [historyFor, setHistoryFor] = useState<Service | null>(null);
  const [category, setCategory] = useState<string>("all");

  const [patientPrice, setPatientPrice] = useState("");
  const [providerPayout, setProviderPayout] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([serviceService.list(), pricingService.list()])
      .then(([svcs, prices]) => {
        const map = new Map(prices.map((p) => [p.id, p]));
        const merged = svcs.map((s) => {
          const attached = (s.prices ?? []).map((p) => map.get(p.id) ?? p);
          return { ...s, prices: attached };
        });
        setServices(merged);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load pricing"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const platformMargin = useMemo(() => {
    const p = parseFloat(patientPrice);
    const v = parseFloat(providerPayout);
    if (isNaN(p) || isNaN(v)) return null;
    return p - v;
  }, [patientPrice, providerPayout]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: services.length };
    for (const c of CATEGORIES) {
      map[c.key] = services.filter((s) => s.category === c.key).length;
    }
    return map;
  }, [services]);

  const filtered = useMemo(() => {
    if (category === "all") return services;
    return services.filter((s) => s.category === category);
  }, [services, category]);

  const openEdit = (svc: Service) => {
    const active = activePrice(svc);
    setEditing(svc);
    setPatientPrice(active ? String(active.patientPrice) : "");
    setProviderPayout(active ? String(active.providerPayout) : "");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!editing) return;
    const p = parseFloat(patientPrice);
    const v = parseFloat(providerPayout);
    if (isNaN(p) || isNaN(v) || p < 0 || v < 0) {
      toast.error("Please enter valid positive numbers for both prices.");
      return;
    }
    if (v > p) {
      toast.error("Provider payout cannot exceed patient price.");
      return;
    }
    setSubmitting(true);
    try {
      await adminService.updatePricing(editing.id, p, v, effectiveFrom, ADMIN_ACTOR_ID);
      toast.success(`Pricing updated for ${editing.name}.`);
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update pricing.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const totalActiveServices = services.filter((s) => activePrice(s)).length;
  const totalRevenue = services.reduce((s, x) => s + (activePrice(x)?.patientPrice ?? 0), 0);
  const totalPayout = services.reduce((s, x) => s + (activePrice(x)?.providerPayout ?? 0), 0);
  const totalMargin = totalRevenue - totalPayout;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pricing"
        description="Patient prices, payouts, margins. Changes preserve history."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pricing" }]}
        actions={
          <div className="text-xs text-muted-foreground hidden sm:block">
            <span className="font-semibold text-foreground">{totalActiveServices}</span> active · Margin {formatCurrency(totalMargin)}
          </div>
        }
      />

      {/* Category segmented control (4 most common + All) */}
      <div className="overflow-x-auto -mx-4 px-4 pb-1">
        <SegmentedControl
          options={[
            { value: "all", label: "All", badge: counts.all },
            ...CATEGORIES.slice(0, 4).map((c) => ({ value: c.key, label: c.label, badge: counts[c.key] })),
          ]}
          value={category}
          onChange={setCategory}
          size="sm"
          className="min-w-[28rem]"
        />
      </div>

      {/* Hidden categories overflow (visible on scroll) */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 lg:hidden">
        {CATEGORIES.slice(4).map((c) => {
          const Icon = c.icon;
          const active = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all tap-highlight-none ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {c.label}
              <span className="text-[10px] rounded-full px-1 bg-primary-foreground/20">{counts[c.key]}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Tag} title="No services" description="No services in this category." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((svc) => {
            const active = activePrice(svc);
            const history = priceHistory(svc);
            const cat = CATEGORIES.find((c) => c.key === svc.category);
            const Icon = cat?.icon ?? Tag;
            return (
              <CompactListItem
                key={svc.id}
                leading={<div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>}
                title={svc.name}
                subtitle={`${active ? `${formatCurrency(active.patientPrice)} patient · ${formatCurrency(active.providerPayout)} payout` : "No active price"}${history.length > 1 ? ` · ${history.length} price records` : ""}`}
                trailing={
                  <div className="flex items-center gap-2">
                    {active && <span className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(active.platformMargin)}</span>}
                    {history.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setHistoryFor(svc); }} aria-label="History">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); openEdit(svc); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </div>
                }
                onClick={() => openEdit(svc)}
              />
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit pricing — {editing?.name}</DialogTitle>
            <DialogDescription>
              Current active price will be deactivated and a new active price created.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="patientPrice">Patient price (₦)</Label>
              <Input id="patientPrice" type="number" value={patientPrice} onChange={(e) => setPatientPrice(e.target.value)} placeholder="15000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="providerPayout">Provider payout (₦)</Label>
              <Input id="providerPayout" type="number" value={providerPayout} onChange={(e) => setProviderPayout(e.target.value)} placeholder="11000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effectiveFrom">Effective from</Label>
              <Input id="effectiveFrom" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="rounded-xl border bg-muted/40 p-3 grid grid-cols-2 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Platform margin</p>
                <p className={`text-sm font-semibold ${platformMargin == null ? "text-muted-foreground" : platformMargin < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {platformMargin == null ? "—" : formatCurrency(platformMargin)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Margin %</p>
                <p className="text-sm font-semibold">
                  {platformMargin == null || !parseFloat(patientPrice) ? "—" : `${((platformMargin / parseFloat(patientPrice)) * 100).toFixed(1)}%`}
                </p>
              </div>
            </div>
            {editing && activePrice(editing) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-1 font-medium mb-1">
                  {parseFloat(patientPrice) > (activePrice(editing)?.patientPrice ?? 0) ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  Current: {formatCurrency(activePrice(editing)!.patientPrice)} patient / {formatCurrency(activePrice(editing)!.providerPayout)} payout
                </div>
                <p>Provider dashboards will automatically reflect the new price.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={submitting || platformMargin == null || platformMargin < 0}>
              {submitting ? "Saving…" : "Save new price"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Price history</DialogTitle>
            <DialogDescription>
              {historyFor?.name} — {historyFor ? priceHistory(historyFor).length : 0} record(s).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto -mx-2 px-2">
            <ul className="space-y-2">
              {historyFor && priceHistory(historyFor).map((p) => (
                <li key={p.id} className="rounded-xl border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <StatusBadge status={p.status} size="sm" />
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(p.effectiveFrom)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wider">Patient</p>
                      <p className="font-semibold mt-0.5">{formatCurrency(p.patientPrice)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wider">Payout</p>
                      <p className="font-semibold mt-0.5">{formatCurrency(p.providerPayout)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wider">Margin</p>
                      <p className="font-semibold text-emerald-700 mt-0.5">{formatCurrency(p.platformMargin)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
