"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService } from "@/lib/services";
import type { PharmacyProduct } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { Fab } from "@/components/healthcare/fab";
import { formatCurrency, formatDate, genId } from "@/lib/format";
import { Pill, Plus, Search, Pencil, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Prescription Medicine",
  "Over-the-Counter",
  "Medical Device",
  "Supplement",
  "Personal Care",
  "First Aid",
];

const DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Inhaler", "Suppository", "Powder"];
const STATUS_OPTIONS = ["active", "inactive", "discontinued"];

interface FormState {
  id?: string;
  name: string;
  genericName: string;
  brand: string;
  category: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  price: string;
  stockQuantity: string;
  batch: string;
  expiryDate: string;
  prescriptionRequired: boolean;
  storageRequirements: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  genericName: "",
  brand: "",
  category: CATEGORIES[0],
  strength: "",
  dosageForm: DOSAGE_FORMS[0],
  manufacturer: "",
  price: "",
  stockQuantity: "",
  batch: "",
  expiryDate: "",
  prescriptionRequired: true,
  storageRequirements: "Store below 25°C",
  status: "active",
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

type Filter = "all" | "low_stock" | "near_expiry" | "out_of_stock";

export function PharmacyProducts() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!pharmacyId) return;
    setError(null);
    pharmacyService
      .products(pharmacyId)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    pharmacyService
      .products(pharmacyId)
      .then((list) => { if (!cancelled) setProducts(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load products"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const counts = useMemo(() => ({
    all: products.length,
    low_stock: products.filter((p) => p.stockQuantity > 0 && p.stockQuantity < 10 && p.status === "active").length,
    near_expiry: products.filter((p) => p.status === "active" && daysUntil(p.expiryDate) <= 90).length,
    out_of_stock: products.filter((p) => p.stockQuantity === 0 && p.status === "active").length,
  }), [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (category !== "all") list = list.filter((p) => p.category === category);
    switch (filter) {
      case "low_stock": list = list.filter((p) => p.stockQuantity > 0 && p.stockQuantity < 10 && p.status === "active"); break;
      case "near_expiry": list = list.filter((p) => p.status === "active" && daysUntil(p.expiryDate) <= 90); break;
      case "out_of_stock": list = list.filter((p) => p.stockQuantity === 0 && p.status === "active"); break;
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.genericName.toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, category, query, filter]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: PharmacyProduct) => {
    setForm({
      id: p.id,
      name: p.name,
      genericName: p.genericName,
      brand: p.brand ?? "",
      category: p.category,
      strength: p.strength,
      dosageForm: p.dosageForm,
      manufacturer: p.manufacturer ?? "",
      price: String(p.price),
      stockQuantity: String(p.stockQuantity),
      batch: p.batch ?? "",
      expiryDate: p.expiryDate,
      prescriptionRequired: p.prescriptionRequired,
      storageRequirements: p.storageRequirements ?? "",
      status: p.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!pharmacyId) return;
    if (!form.name.trim() || !form.strength.trim() || !form.expiryDate) {
      toast.error("Please fill in name, strength and expiry date.");
      return;
    }
    const price = Number(form.price || 0);
    const stock = Number(form.stockQuantity || 0);
    if (price < 0 || stock < 0) {
      toast.error("Price and stock must be 0 or positive.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        pharmacyId,
        name: form.name.trim(),
        genericName: form.genericName.trim() || form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category,
        strength: form.strength.trim(),
        dosageForm: form.dosageForm,
        manufacturer: form.manufacturer.trim() || null,
        price,
        stockQuantity: stock,
        batch: form.batch.trim() || null,
        expiryDate: form.expiryDate,
        prescriptionRequired: form.prescriptionRequired,
        storageRequirements: form.storageRequirements.trim() || null,
        status: form.status,
      };
      if (form.id) {
        await pharmacyService.updateProduct(form.id, payload);
        toast.success("Product updated.");
      } else {
        await pharmacyService.createProduct({ id: genId("MED"), ...payload });
        toast.success("Product added to catalogue.");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={6} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeFilters = (category !== "all" ? 1 : 0) + (query.trim() ? 1 : 0);

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <PageHeader
        title="Product catalogue"
        description="Manage prices, stock and availability."
        actions={
          <Button onClick={openCreate} className="hidden lg:inline-flex">
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
      />

      {/* Search + category filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, generic or brand…"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="default"
          className="lg:hidden relative"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </Button>
        <div className="hidden lg:block">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile collapsible filters */}
      {filtersOpen && (
        <Card className="lg:hidden">
          <CardContent className="p-4 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Segmented control for status filter */}
      <SegmentedControl
        options={[
          { value: "all" as Filter, label: "All", badge: counts.all },
          { value: "low_stock" as Filter, label: "Low stock", badge: counts.low_stock },
          { value: "near_expiry" as Filter, label: "Near expiry", badge: counts.near_expiry },
          { value: "out_of_stock" as Filter, label: "Out of stock", badge: counts.out_of_stock },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={query || category !== "all" ? "No matching products" : "No products yet"}
          description={query || category !== "all" ? "Try a different search or category." : "Add your first product to start receiving orders."}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          }
          compact
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Rx?</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const days = daysUntil(p.expiryDate);
                    const isLow = p.stockQuantity < 10;
                    const isExpiringSoon = days <= 90;
                    const isExpired = days < 0;
                    return (
                      <TableRow key={p.id} className={isLow ? "bg-amber-50/40" : ""}>
                        <TableCell>
                          <button
                            className="text-left"
                            onClick={() => navigate("pharmacy", "product", { id: p.id })}
                          >
                            <p className="font-medium hover:underline">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.genericName}{p.brand ? ` · ${p.brand}` : ""}</p>
                          </button>
                        </TableCell>
                        <TableCell className="text-xs">{p.category}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(p.price)}</TableCell>
                        <TableCell className="text-right">
                          <span className={isLow ? "font-semibold text-amber-700" : ""}>
                            {p.stockQuantity}
                          </span>
                          {isLow && p.stockQuantity > 0 && (
                            <Badge variant="outline" className="ml-1 text-[10px] h-5 border-amber-200 bg-amber-50 text-amber-700">Low</Badge>
                          )}
                          {p.stockQuantity === 0 && (
                            <Badge variant="outline" className="ml-1 text-[10px] h-5 border-rose-200 bg-rose-50 text-rose-700">Out</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={isExpired ? "text-rose-700 font-medium" : isExpiringSoon ? "text-amber-700" : ""}>
                            {formatDate(p.expiryDate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {p.prescriptionRequired ? (
                            <Badge variant="outline" className="text-[10px] h-5 border-sky-200 bg-sky-50 text-sky-700">Rx</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5">OTC</Badge>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={p.status} size="sm" /></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile: CompactListItem list */}
          <div className="md:hidden rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {filtered.map((p) => {
              const days = daysUntil(p.expiryDate);
              const isLow = p.stockQuantity > 0 && p.stockQuantity < 10;
              const isOut = p.stockQuantity === 0;
              const isExpiringSoon = days <= 90;
              const isExpired = days < 0;
              return (
                <CompactListItem
                  key={p.id}
                  leading={
                    <div className={`rounded-lg p-2 ring-1 ${isOut ? "bg-rose-50 ring-rose-100" : isLow ? "bg-amber-50 ring-amber-100" : "bg-muted"}`}>
                      <Pill className={`h-4 w-4 ${isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-muted-foreground"}`} />
                    </div>
                  }
                  title={`${p.name} ${p.strength} ${p.dosageForm}`}
                  subtitle={`${formatCurrency(p.price)} · ${p.brand ?? p.genericName} · Exp ${formatDate(p.expiryDate)}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-bold tabular-nums ${isOut ? "text-rose-700" : isLow ? "text-amber-700" : ""}`}>
                        {p.stockQuantity}
                      </span>
                      {isExpiringSoon && (
                        <span className={`text-[10px] ${isExpired ? "text-rose-700" : "text-amber-700"}`}>
                          {isExpired ? "Expired" : "Soon exp"}
                        </span>
                      )}
                    </div>
                  }
                  onClick={() => navigate("pharmacy", "product", { id: p.id })}
                  chevron
                />
              );
            })}
          </div>
        </>
      )}

      {/* FAB (mobile) */}
      <Fab icon={Plus} label="Add product" onClick={openCreate} className="lg:hidden" />

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "Add new product"}</DialogTitle>
            <DialogDescription>
              {form.id
                ? "You can update price, stock, expiry and status. Commission rate is set by Royal Palace admin."
                : "Fill in the details below to add a new product to your catalogue."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="name">Product name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amoxicillin" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="genericName">Generic name</Label>
              <Input id="genericName" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} placeholder="e.g. Amoxicillin" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Amoxil" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dosageForm">Dosage form</Label>
              <Select value={form.dosageForm} onValueChange={(v) => setForm({ ...form, dosageForm: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOSAGE_FORMS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="strength">Strength *</Label>
              <Input id="strength" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="e.g. 500mg" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input id="manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="e.g. GSK" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="price">Price (₦) *</Label>
              <Input id="price" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 4500" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stockQuantity">Stock quantity *</Label>
              <Input id="stockQuantity" type="number" min="0" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} placeholder="e.g. 100" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="batch">Batch number</Label>
              <Input id="batch" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="e.g. AMX2026A" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expiryDate">Expiry date *</Label>
              <Input id="expiryDate" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="storage">Storage requirements</Label>
              <Textarea id="storage" value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} placeholder="e.g. Store below 25°C" rows={2} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border p-3">
              <Switch
                id="prescriptionRequired"
                checked={form.prescriptionRequired}
                onCheckedChange={(v) => setForm({ ...form, prescriptionRequired: v })}
              />
              <Label htmlFor="prescriptionRequired" className="cursor-pointer">
                <span className="text-sm font-medium">Prescription required</span>
                <span className="block text-xs text-muted-foreground">Toggle off for over-the-counter products.</span>
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : form.id ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
