"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { PackagePlus, Pill, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type CatalogItem = PrescriptionComponents["schemas"]["PharmacyCatalogItem"];
type Classification = PrescriptionComponents["schemas"]["PharmacyProductClassification"];

const EMPTY_FORM = {
  brandName: "",
  categoryId: "",
  controlledMedication: false,
  currency: "",
  dosageFormId: "",
  genericName: "",
  lowStockThreshold: "",
  manufacturer: "",
  name: "",
  nearExpiryDays: "",
  prescriptionRequired: false,
  sku: "",
  storageRequirements: "",
  strength: "",
  unitPriceMinor: "",
};

export function PharmacyProducts() {
  const organizationId = useNav().session?.profileId;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Classification[]>([]);
  const [dosageForms, setDosageForms] = useState<Classification[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [page, categoryData, dosageData] = await Promise.all([
        productionPrescriptionService.pharmacy.catalogItems(organizationId, { limit: 50 }),
        productionPrescriptionService.pharmacy.productClassifications(organizationId, "CATEGORY"),
        productionPrescriptionService.pharmacy.productClassifications(
          organizationId,
          "DOSAGE_FORM",
        ),
      ]);
      setItems([...page.data]);
      setCategories([...categoryData]);
      setDosageForms([...dosageData]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product catalogue could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => void load(), [load]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return items;
    return items.filter((item) =>
      [item.name, item.genericName, item.brandName, item.sku].some((value) =>
        value?.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [items, query]);

  async function createItem() {
    if (!organizationId) return;
    setSaving(true);
    try {
      await productionPrescriptionService.pharmacy.createCatalogItem(organizationId, {
        ...(form.brandName.trim() ? { brandName: form.brandName.trim() } : {}),
        categoryId: form.categoryId,
        controlledMedication: form.controlledMedication,
        currency: form.currency.trim().toUpperCase(),
        dosageFormId: form.dosageFormId,
        ...(form.genericName.trim() ? { genericName: form.genericName.trim() } : {}),
        lowStockThreshold: form.lowStockThreshold,
        ...(form.manufacturer.trim() ? { manufacturer: form.manufacturer.trim() } : {}),
        name: form.name.trim(),
        nearExpiryDays: Number(form.nearExpiryDays),
        prescriptionRequired: form.prescriptionRequired,
        sku: form.sku.trim(),
        ...(form.storageRequirements.trim()
          ? { storageRequirements: form.storageRequirements.trim() }
          : {}),
        ...(form.strength.trim() ? { strength: form.strength.trim() } : {}),
        unitPriceMinor: form.unitPriceMinor,
      });
      toast.success("Product added to the controlled pharmacy catalogue");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Product could not be created");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product catalogue"
        description="Manage pharmacy products, commercial details, and stock controls."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Add product
          </Button>
        }
      />
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, generic, brand, or SKU"
        />
      </div>
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Catalogue unavailable" description={error} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={query ? "No matching products" : "No products yet"}
          description={
            query
              ? "Try another search term."
              : "Add the first product, then receive its stock into an inventory location."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="text-left"
              onClick={() => navigate("pharmacy", "product", { id: item.id })}
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.strength ?? "Strength not specified"} · {item.dosageForm.name}
                      </p>
                    </div>
                    <StatusBadge status={item.status.toLowerCase()} size="sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p className="font-medium">
                        {formatMinorCurrency(item.unitPriceMinor, item.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className={item.lowStock ? "font-semibold text-amber-700" : "font-medium"}>
                        {item.availableQuantity}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.category.name} · SKU {item.sku}
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Create the catalogue record first. Stock is received separately with batch and expiry
              evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Product name"
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <Field label="SKU" value={form.sku} onChange={(sku) => setForm({ ...form, sku })} />
            <Field
              label="Generic name"
              value={form.genericName}
              onChange={(genericName) => setForm({ ...form, genericName })}
            />
            <Field
              label="Brand"
              value={form.brandName}
              onChange={(brandName) => setForm({ ...form, brandName })}
            />
            <Choice
              label="Category"
              value={form.categoryId}
              onChange={(categoryId) => setForm({ ...form, categoryId })}
              options={categories}
            />
            <Choice
              label="Dosage form"
              value={form.dosageFormId}
              onChange={(dosageFormId) => setForm({ ...form, dosageFormId })}
              options={dosageForms}
            />
            <Field
              label="Strength"
              value={form.strength}
              onChange={(strength) => setForm({ ...form, strength })}
            />
            <Field
              label="Manufacturer"
              value={form.manufacturer}
              onChange={(manufacturer) => setForm({ ...form, manufacturer })}
            />
            <Field
              label="ISO currency code"
              value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })}
              placeholder="e.g. NGN, USD"
            />
            <Field
              label="Unit price in minor units"
              value={form.unitPriceMinor}
              onChange={(unitPriceMinor) => setForm({ ...form, unitPriceMinor })}
              inputMode="numeric"
            />
            <Field
              label="Low-stock threshold"
              value={form.lowStockThreshold}
              onChange={(lowStockThreshold) => setForm({ ...form, lowStockThreshold })}
              inputMode="decimal"
            />
            <Field
              label="Near-expiry window (days)"
              value={form.nearExpiryDays}
              onChange={(nearExpiryDays) => setForm({ ...form, nearExpiryDays })}
              inputMode="numeric"
            />
            <div className="sm:col-span-2">
              <Field
                label="Storage requirements"
                value={form.storageRequirements}
                onChange={(storageRequirements) => setForm({ ...form, storageRequirements })}
              />
            </div>
            <Toggle
              label="Prescription required"
              checked={form.prescriptionRequired}
              onChange={(prescriptionRequired) => setForm({ ...form, prescriptionRequired })}
            />
            <Toggle
              label="Controlled medication"
              checked={form.controlledMedication}
              onChange={(controlledMedication) => setForm({ ...form, controlledMedication })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void createItem()}>
              {saving ? "Saving…" : "Add product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  onChange,
  value,
  ...inputProps
}: { label: string; onChange: (value: string) => void; value: string } & Pick<
  React.ComponentProps<typeof Input>,
  "inputMode" | "placeholder"
>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} {...inputProps} />
    </div>
  );
}

function Choice({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Classification[];
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
