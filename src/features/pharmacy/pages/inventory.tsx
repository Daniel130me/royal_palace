"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService } from "@/lib/services";
import type { PharmacyProduct } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Boxes, AlertTriangle, CalendarClock, PackageX, RefreshCw, ArrowRight } from "lucide-react";
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

  // Quick-update dialog
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

  if (loading) return <LoadingState label="Loading inventory…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const tabs: { key: Tab; label: string; count: number; tone: string }[] = [
    { key: "low_stock", label: "Low stock", count: lowStock.length, tone: "text-amber-700" },
    { key: "out_of_stock", label: "Out of stock", count: outOfStock.length, tone: "text-rose-700" },
    { key: "near_expiry", label: "Near expiry", count: nearExpiry.length, tone: "text-amber-700" },
    { key: "all", label: "All active", count: products.filter((p) => p.status === "active").length, tone: "" },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory management"
        description="Track low stock, out-of-stock and near-expiry products. Update stock quickly."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Inventory" }]}
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">Low stock</p>
                <p className="text-2xl font-bold text-amber-700">{lowStock.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PackageX className="h-5 w-5 text-rose-600" />
              <div>
                <p className="text-xs text-muted-foreground">Out of stock</p>
                <p className="text-2xl font-bold text-rose-700">{outOfStock.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">Near expiry</p>
                <p className="text-2xl font-bold text-amber-700">{nearExpiry.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-xs text-muted-foreground">Active SKUs</p>
                <p className="text-2xl font-bold">{products.filter((p) => p.status === "active").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap rounded-lg border bg-background p-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label} <span className="ml-1 opacity-80">({t.count})</span>
          </button>
        ))}
      </div>

      {activeList.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing to flag"
          description="Your inventory is in good shape for this view."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {activeList.map((p) => {
                const days = daysUntil(p.expiryDate);
                return (
                  <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{p.name}</p>
                        <span className="text-xs text-muted-foreground">{p.strength} {p.dosageForm}</span>
                        {p.prescriptionRequired ? (
                          <Badge variant="outline" className="text-[10px] border-sky-200 bg-sky-50 text-sky-700">Rx</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">OTC</Badge>
                        )}
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCurrency(p.price)} · Batch {p.batch ?? "—"} · Expires {formatDate(p.expiryDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${p.stockQuantity === 0 ? "text-rose-700" : p.stockQuantity < LOW_STOCK_THRESHOLD ? "text-amber-700" : ""}`}>
                          {p.stockQuantity}
                        </p>
                        <p className="text-[10px] text-muted-foreground">in stock</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openUpdate(p)}>
                        Update stock
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate("pharmacy", "product", { id: p.id })}>
                        View <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateTarget(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleSaveStock}>
              {saving ? "Saving…" : "Save stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
