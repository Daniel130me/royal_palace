"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService, pharmacyOrderService } from "@/lib/services";
import type { PharmacyProduct, PharmacyOrderItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowLeft, Save, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = ["active", "inactive", "discontinued"];

export function PharmacyProductDetail() {
  const { view } = useNav();
  const id = view.params.id;
  const [product, setProduct] = useState<PharmacyProduct | null>(null);
  const [orderItems, setOrderItems] = useState<PharmacyOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields (price + stock + status — NOT commission)
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

  return (
    <div>
      <PageHeader
        title={`${product.name} ${product.strength}`}
        description={`${product.genericName}${product.brand ? ` · ${product.brand}` : ""}`}
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Products", onClick: () => navigate("pharmacy", "products") },
          { label: product.name },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "products")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-500" /> Product details
              </CardTitle>
              <StatusBadge status={product.status} />
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium">{product.category}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Dosage form</dt>
                  <dd className="font-medium">{product.dosageForm}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Manufacturer</dt>
                  <dd className="font-medium">{product.manufacturer ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Batch number</dt>
                  <dd className="font-medium">{product.batch ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expiry date</dt>
                  <dd className="font-medium">{formatDate(product.expiryDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Storage requirements</dt>
                  <dd className="font-medium">{product.storageRequirements ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Prescription required</dt>
                  <dd className="font-medium">{product.prescriptionRequired ? "Yes" : "No (OTC)"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pharmacy</dt>
                  <dd className="font-medium">{product.pharmacy?.name ?? "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Recent sales */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-sky-500" /> Recent sales of this product
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No sales recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {orderItems.slice(0, 8).map((it) => (
                    <li key={it.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium">{it.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty {it.quantity} · {formatCurrency(it.unitPrice)} each
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(it.gross)}</p>
                        <p className="text-xs text-emerald-700">Net {formatCurrency(it.pharmacyNet)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: editable price/stock */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Pricing & stock</CardTitle>
              {!editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {!editing ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Selling price</span>
                    <span className="font-bold text-lg">{formatCurrency(product.price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stock</span>
                    <span className="font-medium">{product.stockQuantity} units</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={product.status} />
                  </div>
                </>
              ) : (
                <>
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
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleSave}>
                      <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-sky-100 bg-sky-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-sky-800">Commission is set centrally</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-sky-800">
              <p>
                Platform commission ({product.pharmacy?.commissionPct ?? "—"}%) is set by the
                Royal Palace admin and applies to all your products. You cannot edit it.
              </p>
              <p className="text-xs text-sky-700">
                View your commission reports in the Commissions tab.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
