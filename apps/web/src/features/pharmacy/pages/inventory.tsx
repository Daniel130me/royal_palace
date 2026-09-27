"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService } from "@/lib/services";
import type { PharmacyProduct } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { AlertTriangle, CalendarClock, PackageX, RefreshCw, Boxes, Pill as PillIcon } from "lucide-react";
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

  const activeCount = products.filter((p) => p.status === "active").length;

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
        title="Inventory"
        description="Track low stock, out-of-stock and near-expiry items."
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* Segmented control */}
      <SegmentedControl
        options={[
          { value: "low_stock" as Tab, label: "Low stock", badge: lowStock.length },
          { value: "out_of_stock" as Tab, label: "Out of stock", badge: outOfStock.length },
          { value: "near_expiry" as Tab, label: "Near expiry", badge: nearExpiry.length },
          { value: "all" as Tab, label: "All active", badge: activeCount },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {activeList.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing to flag"
          description="Your inventory is in good shape for this view."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {activeList.map((p) => {
            const days = daysUntil(p.expiryDate);
            const isOut = p.stockQuantity === 0;
            const isLow = p.stockQuantity > 0 && p.stockQuantity < LOW_STOCK_THRESHOLD;
            const isExpiringSoon = days <= NEAR_EXPIRY_DAYS;
            const isExpired = days < 0;
            return (
              <CompactListItem
                key={p.id}
                leading={
                  <div className={`rounded-lg p-2 ring-1 ${isOut ? "bg-rose-50 ring-rose-100" : isLow ? "bg-amber-50 ring-amber-100" : isExpiringSoon ? "bg-amber-50/50 ring-amber-100" : "bg-muted"}`}>
                    {isOut ? <PackageX className="h-4 w-4 text-rose-600" /> : isLow ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : isExpiringSoon ? <CalendarClock className="h-4 w-4 text-amber-600" /> : <PillIcon className="h-4 w-4 text-muted-foreground" />}
                  </div>
                }
                title={`${p.name} ${p.strength} ${p.dosageForm}`}
                subtitle={`${formatCurrency(p.price)} · Batch ${p.batch ?? "—"} · Exp ${formatDate(p.expiryDate)}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-sm font-bold tabular-nums ${isOut ? "text-rose-700" : isLow ? "text-amber-700" : ""}`}>
                      {p.stockQuantity}
                    </span>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openUpdate(p); }}>
                      Update
                    </Button>
                  </div>
                }
                onClick={() => navigate("pharmacy", "product", { id: p.id })}
                chevron
              />
            );
          })}
        </div>
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
