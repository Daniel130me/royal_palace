"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyService, adminService } from "@/lib/services";
import type { Pharmacy } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { toast } from "sonner";
import { Pill, Pencil, MapPin, Phone, Star, Percent, Info, CheckCircle2, ShieldAlert } from "lucide-react";

const ADMIN_ACTOR_ID = "ADM-001";

type FilterKey = "all" | "verified" | "pending";

export function AdminPharmacyCommissions() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Pharmacy | null>(null);
  const [pct, setPct] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = () => {
    setLoading(true);
    setError(null);
    pharmacyService.list()
      .then(setPharmacies)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load pharmacies"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (p: Pharmacy) => {
    setEditing(p);
    setPct(String(p.commissionPct));
    setEffective(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!editing) return;
    const v = parseFloat(pct);
    if (isNaN(v) || v < 0 || v > 100) {
      toast.error("Please enter a valid percentage between 0 and 100.");
      return;
    }
    setSubmitting(true);
    try {
      await adminService.updateCommission(editing.id, v, ADMIN_ACTOR_ID);
      toast.success(`Commission for ${editing.name} updated to ${v}%.`);
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update commission.");
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(() => ({
    all: pharmacies.length,
    verified: pharmacies.filter((p) => p.verificationStatus === "approved").length,
    pending: pharmacies.filter((p) => p.verificationStatus !== "approved").length,
  }), [pharmacies]);

  const avgCommission = pharmacies.length
    ? pharmacies.reduce((s, p) => s + p.commissionPct, 0) / pharmacies.length
    : 0;

  const visible = useMemo(() => {
    if (filter === "verified") return pharmacies.filter((p) => p.verificationStatus === "approved");
    if (filter === "pending") return pharmacies.filter((p) => p.verificationStatus !== "approved");
    return pharmacies;
  }, [pharmacies, filter]);

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
        title="Pharmacy Commissions"
        description="Configure the platform commission percentage for each pharmacy."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pharmacy Commissions" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Pharmacies" value={counts.all} icon={Pill} />
        <StatTile label="Avg commission" value={`${avgCommission.toFixed(2)}%`} icon={Percent} tone="success" />
        <StatTile label="Verified" value={counts.verified} icon={CheckCircle2} tone="success" />
        <StatTile label="Pending" value={counts.pending} icon={ShieldAlert} tone="warning" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as FilterKey, label: "All", badge: counts.all },
          { value: "verified" as FilterKey, label: "Verified", badge: counts.verified },
          { value: "pending" as FilterKey, label: "Pending", badge: counts.pending },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState icon={Pill} title="No pharmacies" description="No pharmacies match this filter." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((p) => (
            <CompactListItem
              key={p.id}
              leading={
                <div className="rounded-lg bg-primary/10 p-2 ring-1 ring-primary/10">
                  <Pill className="h-4 w-4 text-primary" />
                </div>
              }
              title={`${p.name} · ${p.city}, ${p.state}`}
              subtitle={`${p.phone} · ★ ${p.rating.toFixed(1)}`}
              trailing={
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</span>
                    <span className="text-sm font-bold text-emerald-700 tabular-nums">{p.commissionPct}%</span>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEdit(p); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
              }
              onClick={() => openEdit(p)}
              chevron
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Percent className="h-4 w-4" /> Edit commission</DialogTitle>
            <DialogDescription>
              Set the platform commission percentage for {editing?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pct">Commission percentage (%)</Label>
              <Input id="pct" type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="8" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eff">Effective from</Label>
              <Input id="eff" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </div>
            <div className="rounded-xl border bg-muted/40 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Affects newly created orders only. Existing orders retain the commission percentage set at the time of order.
              </p>
            </div>
            {editing && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Current commission: <span className="font-semibold">{editing.commissionPct}%</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Saving…" : "Update commission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
