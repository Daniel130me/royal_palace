"use client";

import { useEffect, useState } from "react";
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
import { MetricCard } from "@/components/healthcare/metric-card";
import {
  PageHeader, SectionCard, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { Pill, Pencil, MapPin, Phone, Star, Percent, Info } from "lucide-react";

const ADMIN_ACTOR_ID = "ADM-001";

export function AdminPharmacyCommissions() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Pharmacy | null>(null);
  const [pct, setPct] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

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

  const avgCommission = pharmacies.length
    ? pharmacies.reduce((s, p) => s + p.commissionPct, 0) / pharmacies.length
    : 0;

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
    <div className="space-y-5">
      <PageHeader
        title="Pharmacy Commissions"
        description="Configure the platform commission percentage for each pharmacy. Changes apply to newly created orders."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Pharmacy Commissions" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Pharmacies" value={pharmacies.length} icon={Pill} />
        <MetricCard label="Avg commission" value={`${avgCommission.toFixed(2)}%`} icon={Percent} tone="success" />
        <MetricCard label="Verified" value={pharmacies.filter((p) => p.verificationStatus === "approved").length} icon={Pill} tone="success" />
        <MetricCard label="Pending" value={pharmacies.filter((p) => p.verificationStatus !== "approved").length} icon={Pill} tone="warning" />
      </div>

      {pharmacies.length === 0 ? (
        <EmptyState icon={Pill} title="No pharmacies" description="Pharmacies will appear here once they register." />
      ) : (
        <SectionCard dense>
          <ul className="divide-y divide-border/60">
            {pharmacies.map((p) => (
              <li key={p.id} className="p-4 flex items-center gap-3 sm:gap-4">
                <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                  <Pill className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{p.name}</p>
                    <StatusBadge status={p.verificationStatus} size="sm" />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.city}, {p.state}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone}</span>
                    <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {p.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
                  <p className="text-xl font-bold text-emerald-700">{p.commissionPct}%</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="shrink-0">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
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
