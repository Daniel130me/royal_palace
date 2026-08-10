"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService, pharmacyOrderService } from "@/lib/services";
import type { PharmacyProduct, PharmacyOrderItem } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Save, Package, ShoppingBag, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = ["active", "inactive", "discontinued"];

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function PharmacyProductDetail() {
  const { view } = useNav();
  const id = view.params.id;
  const [product, setProduct] = useState<PharmacyProduct | null>(null);
  const [orderItems, setOrderItems] = useState<PharmacyOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState("active");

  const load = () => {
    if (!id) return;
    setError(null);
    pharmacyService
      .product(id)
      .then((p) => {
        setProduct(p);
        setPrice(String(p.price));
        setStock(String(p.stockQuantity));
        setStatus(p.status);
        return pharmacyOrderService.list({ pharmacyId: p.pharmacyId });
      })
      .then((orders) => {
        const items: PharmacyOrderItem[] = [];
        for (const o of orders ?? []) {
          for (const it of o.items ?? []) {
            if (it.productId === id) {
              items.push({ ...it });
            }
          }
        }
        setOrderItems(items);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load product"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    pharmacyService
      .product(id)
      .then(async (p) => {
        if (cancelled) return;
        setProduct(p);
        setPrice(String(p.price));
        setStock(String(p.stockQuantity));
        setStatus(p.status);
        const orders = await pharmacyOrderService.list({ pharmacyId: p.pharmacyId });
        if (cancelled) return;
        const items: PharmacyOrderItem[] = [];
        for (const o of orders ?? []) {
          for (const it of o.items ?? []) {
            if (it.productId === id) {
              items.push({ ...it });
            }
          }
        }
        setOrderItems(items);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load product"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await pharmacyService.updateProduct(product.id, {
        price: Number(price),
        stockQuantity: Number(stock),
        status,
      });
      toast.success("Product updated.");
      setEditing(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading product…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!product) return <ErrorState message="Product not found." />;

  const days = daysUntil(product.expiryDate);
  const isLowStock = product.stockQuantity < 10;
  const isExpiringSoon = days <= 90;
  const isExpired = days < 0;

  return (
    <div className="pb-28 lg:pb-0 space-y-6">
      <PageHeader
        title={`${product.name} ${product.strength}`}
        description={`${product.genericName}${product.brand ? ` · ${product.brand}` : ""}`}
        back
        actions={<StatusBadge status={product.status} size="sm" />}
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Product details"
            icon={Package}
          >
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Category</dt>
                <dd className="font-medium mt-0.5">{product.category}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Dosage form</dt>
                <dd className="font-medium mt-0.5">{product.dosageForm}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Manufacturer</dt>
                <dd className="font-medium mt-0.5">{product.manufacturer ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Batch number</dt>
                <dd className="font-medium mt-0.5 font-mono text-xs">{product.batch ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Expiry date</dt>
                <dd className={`font-medium mt-0.5 ${isExpired ? "text-rose-700" : isExpiringSoon ? "text-amber-700" : ""}`}>
                  {formatDate(product.expiryDate)}
                  {isExpired ? " · Expired" : isExpiringSoon ? ` · ${days} days left` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Prescription required</dt>
                <dd className="font-medium mt-0.5">
                  {product.prescriptionRequired ? (
                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Rx required</Badge>
                  ) : (
                    <Badge variant="outline">OTC</Badge>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Storage requirements</dt>
                <dd className="font-medium mt-0.5">{product.storageRequirements ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">Pharmacy</dt>
                <dd className="font-medium mt-0.5">{product.pharmacy?.name ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard
            title="Recent sales of this product"
            description={`${orderItems.length} sale(s)`}
            icon={ShoppingBag}
            dense
          >
            {orderItems.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {orderItems.slice(0, 8).map((it) => (
                  <CompactListItem
                    key={it.id}
                    leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><ShoppingBag className="h-4 w-4 text-emerald-600" /></div>}
                    title={it.productName}
                    subtitle={`Qty ${it.quantity} · ${formatCurrency(it.unitPrice)} each`}
                    trailing={
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm font-semibold tabular-nums">{formatCurrency(it.gross)}</span>
                        <span className="text-[10px] text-emerald-700 tabular-nums">Net {formatCurrency(it.pharmacyNet)}</span>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Pricing & stock"
            icon={Package}
            action={!editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : undefined}
          >
            {!editing ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Selling price</p>
                  <p className="font-bold text-2xl text-emerald-700 mt-0.5 tabular-nums">{formatCurrency(product.price)}</p>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stock</span>
                  <span className={`font-bold tabular-nums ${product.stockQuantity === 0 ? "text-rose-700" : isLowStock ? "text-amber-700" : ""}`}>
                    {product.stockQuantity} units
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={product.status} size="sm" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="price">Selling price (₦)</Label>
                  <Input id="price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <p className="text-xs text-muted-foreground">You set the selling price for your pharmacy.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="stock">Stock quantity</Label>
                  <Input id="stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={saving} onClick={handleSave}>
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </SectionCard>

          {/* Mobile bottom action bar when editing */}
          {editing && (
            <BottomActionBar className="lg:hidden">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                <Button className="flex-1" disabled={saving} onClick={handleSave}>
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </BottomActionBar>
          )}

          <Card className="border-sky-200 bg-sky-50/40">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-sky-900 flex items-center gap-2 mb-1.5">
                <ShieldAlert className="h-4 w-4" /> Commission is set centrally
              </p>
              <p className="text-xs text-sky-800 leading-relaxed">
                Platform commission ({product.pharmacy?.commissionPct ?? "—"}%) is set by the
                Royal Palace admin and applies to all your products.
              </p>
              <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate("pharmacy", "commissions")}>
                View commission reports
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
