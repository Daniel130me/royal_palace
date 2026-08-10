"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService } from "@/lib/services";
import type { PharmacyProduct } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Boxes, AlertTriangle, CalendarClock, PackageX, RefreshCw, ArrowRight, Pill as PillIcon } from "lucide-react";
import { toast } from "sonner";

type Tab = "low_stock" | "near_expiry" | "out_of_stock" | "all";

const NEAR_EXPIRY_DAYS = 90;
const LOW_STOCK_THRESHOLD = 10;

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function PharmacyInventory() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("low_stock");

  const [updateTarget, setUpdateTarget] = useState<PharmacyProduct | null>(null);
  const [newStock, setNewStock] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!pharmacyId) return;
    setError(null);
    pharmacyService
      .products(pharmacyId)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load inventory"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    pharmacyService
      .products(pharmacyId)
      .then((list) => { if (!cancelled) setProducts(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load inventory"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const lowStock = useMemo(
    () => products.filter((p) => p.stockQuantity < LOW_STOCK_THRESHOLD && p.stockQuantity > 0 && p.status === "active"),
    [products]
  );
  const outOfStock = useMemo(
    () => products.filter((p) => p.stockQuantity === 0 && p.status === "active"),
    [products]
  );
  const nearExpiry = useMemo(
    () =>
      products
        .filter((p) => p.status === "active" && daysUntil(p.expiryDate) <= NEAR_EXPIRY_DAYS)
        .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
    [products]
  );

  const activeList = useMemo(() => {
    switch (tab) {
      case "low_stock": return lowStock;
      case "out_of_stock": return outOfStock;
      case "near_expiry": return nearExpiry;
      case "all": return products.filter((p) => p.status === "active");
    }
  }, [tab, lowStock, outOfStock, nearExpiry, products]);

  const openUpdate = (p: PharmacyProduct) => {
    setUpdateTarget(p);
    setNewStock(String(p.stockQuantity));
  };

  const handleSaveStock = async () => {
    if (!updateTarget) return;
    const qty = Number(newStock);
    if (isNaN(qty) || qty < 0) {
      toast.error("Enter a valid stock quantity.");
      return;
    }
    setSaving(true);
    try {
      await pharmacyService.updateProduct(updateTarget.id, { stockQuantity: qty });
      toast.success(`Stock updated to ${qty} units.`);
      setUpdateTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update stock");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeCount = products.filter((p) => p.status === "active").length;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "low_stock", label: "Low stock", count: lowStock.length },
    { key: "out_of_stock", label: "Out of stock", count: outOfStock.length },
    { key: "near_expiry", label: "Near expiry", count: nearExpiry.length },
    { key: "all", label: "All active", count: activeCount },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory management"
        description="Track low stock, out-of-stock and near-expiry products. Update stock quickly."
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Low stock" value={lowStock.length} icon={AlertTriangle} tone="warning" hint="< 10 units" />
        <MetricCard label="Out of stock" value={outOfStock.length} icon={PackageX} tone="danger" hint="Restock needed" />
        <MetricCard label="Near expiry" value={nearExpiry.length} icon={CalendarClock} tone="warning" hint="< 90 days" />
        <MetricCard label="Active SKUs" value={activeCount} icon={Boxes} tone="success" />
      </div>

      {/* Tabs */}
      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md">
        <div className="inline-flex rounded-lg border bg-card p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.key ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${tab === t.key ? "bg-primary-foreground/20" : "bg-muted"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeList.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing to flag"
          description="Your inventory is in good shape for this view."
        />
      ) : (
        <SectionCard dense>
          <ul className="divide-y divide-border/60">
            {activeList.map((p) => {
              const days = daysUntil(p.expiryDate);
              return (
                <li key={p.id} className="flex flex-col gap-3 p-4 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{p.name}</p>
                      <span className="text-xs text-muted-foreground">{p.strength} {p.dosageForm}</span>
                      {p.prescriptionRequired ? (
                        <Badge variant="outline" className="text-[10px] h-5 border-sky-200 bg-sky-50 text-sky-700">Rx</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5">OTC</Badge>
                      )}
                      <StatusBadge status={p.status} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(p.price)} · Batch {p.batch ?? "—"} · Expires {formatDate(p.expiryDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-bold tabular-nums ${p.stockQuantity === 0 ? "text-rose-700" : p.stockQuantity < LOW_STOCK_THRESHOLD ? "text-amber-700" : ""}`}>
                        {p.stockQuantity}
                      </p>
                      <p className="text-[10px] text-muted-foreground">in stock</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openUpdate(p)}>
                      <PillIcon className="h-3.5 w-3.5" /> Update stock
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate("pharmacy", "product", { id: p.id })}>
                      View <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* Quick stock update dialog */}
      <Dialog open={!!updateTarget} onOpenChange={(o) => !o && setUpdateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update stock</DialogTitle>
            <DialogDescription>
              {updateTarget ? `${updateTarget.name} ${updateTarget.strength} ${updateTarget.dosageForm}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newStock">New stock quantity</Label>
            <Input
              id="newStock"
              type="number"
              min="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              autoFocus
            />
            {updateTarget && (
              <p className="text-xs text-muted-foreground">
                Current stock: <span className="font-medium">{updateTarget.stockQuantity}</span> units.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateTarget(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSaveStock}>
              {saving ? "Saving…" : "Save stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
