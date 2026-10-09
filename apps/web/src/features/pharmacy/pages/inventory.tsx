"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { AlertTriangle, CalendarClock, MapPin, PackageCheck, PackageX, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
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
import { formatDate } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type CatalogItem = PrescriptionComponents["schemas"]["PharmacyCatalogItem"];
type Location = PrescriptionComponents["schemas"]["InventoryLocation"];
type Lot = PrescriptionComponents["schemas"]["InventoryLot"];
type View = "LOW_STOCK" | "OUT_OF_STOCK" | "NEAR_EXPIRY" | "ALL";

export function PharmacyInventory() {
  const organizationId = useNav().session?.profileId;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [view, setView] = useState<View>("LOW_STOCK");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationForm, setLocationForm] = useState({ code: "", name: "" });
  const [receive, setReceive] = useState({
    batchNumber: "",
    catalogItemId: "",
    expiryDate: "",
    locationId: "",
    quantity: "",
  });

  const load = useCallback(async () => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [catalogue, locationData, lotData] = await Promise.all([
        productionPrescriptionService.pharmacy.catalogItems(organizationId, {
          limit: 50,
          status: "ACTIVE",
        }),
        productionPrescriptionService.pharmacy.inventoryLocations(organizationId, "ACTIVE"),
        productionPrescriptionService.pharmacy.inventoryLots(organizationId, { limit: 50 }),
      ]);
      setItems([...catalogue.data]);
      setLocations([...locationData]);
      setLots([...lotData.data]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inventory could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    if (view === "LOW_STOCK")
      return items.filter((item) => item.lowStock && Number(item.availableQuantity) > 0);
    if (view === "OUT_OF_STOCK")
      return items.filter((item) => Number(item.availableQuantity) === 0);
    if (view === "NEAR_EXPIRY") {
      const itemIds = new Set(
        lots
          .filter((lot) => {
            const item = items.find((candidate) => candidate.id === lot.catalogItemId);
            if (!item) return false;
            const days =
              (new Date(`${lot.expiryDate}T00:00:00Z`).getTime() - Date.now()) / 86_400_000;
            return days >= 0 && days <= item.nearExpiryDays;
          })
          .map((lot) => lot.catalogItemId),
      );
      return items.filter((item) => itemIds.has(item.id));
    }
    return items;
  }, [items, lots, view]);

  async function createLocation() {
    if (!organizationId) return;
    setSaving(true);
    try {
      await productionPrescriptionService.pharmacy.createInventoryLocation(
        organizationId,
        locationForm,
      );
      toast.success("Inventory location created");
      setLocationOpen(false);
      setLocationForm({ code: "", name: "" });
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Location could not be created");
    } finally {
      setSaving(false);
    }
  }

  async function receiveStock() {
    if (!organizationId) return;
    setSaving(true);
    try {
      await productionPrescriptionService.pharmacy.recordInventoryMovement(organizationId, {
        ...receive,
        idempotencyKey: crypto.randomUUID(),
        reasonCode: "PURCHASE_RECEIPT",
        receivedAt: new Date().toISOString(),
        type: "RECEIVE",
      });
      toast.success("Stock receipt recorded with immutable movement evidence");
      setReceiveOpen(false);
      setReceive({
        batchNumber: "",
        catalogItemId: "",
        expiryDate: "",
        locationId: "",
        quantity: "",
      });
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Stock could not be received");
    } finally {
      setSaving(false);
    }
  }

  const counts = {
    ALL: items.length,
    LOW_STOCK: items.filter((item) => item.lowStock && Number(item.availableQuantity) > 0).length,
    OUT_OF_STOCK: items.filter((item) => Number(item.availableQuantity) === 0).length,
    NEAR_EXPIRY: new Set(
      lots
        .filter((lot) => {
          const item = items.find((candidate) => candidate.id === lot.catalogItemId);
          if (!item) return false;
          const days =
            (new Date(`${lot.expiryDate}T00:00:00Z`).getTime() - Date.now()) / 86_400_000;
          return days >= 0 && days <= item.nearExpiryDays;
        })
        .map((lot) => lot.catalogItemId),
    ).size,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Monitor stock, batches, and expiry across controlled pharmacy locations."
        actions={
          <>
            <Button variant="outline" onClick={() => setLocationOpen(true)}>
              <MapPin className="h-4 w-4" /> Add location
            </Button>
            <Button
              onClick={() => setReceiveOpen(true)}
              disabled={items.length === 0 || locations.length === 0}
            >
              <Plus className="h-4 w-4" /> Receive stock
            </Button>
          </>
        }
      />
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Inventory views">
        {(["LOW_STOCK", "OUT_OF_STOCK", "NEAR_EXPIRY", "ALL"] as const).map((option) => (
          <Button
            key={option}
            role="tab"
            aria-selected={view === option}
            variant={view === option ? "default" : "outline"}
            onClick={() => setView(option)}
          >
            {label(option)} <span className="tabular-nums opacity-75">{counts[option]}</span>
          </Button>
        ))}
      </div>
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Inventory unavailable" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Nothing in this view"
          description="Stock alerts will appear here when configured thresholds or expiry windows are reached."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => {
            const nextLot = lots.find((lot) => lot.catalogItemId === item.id);
            const Icon =
              Number(item.availableQuantity) === 0
                ? PackageX
                : view === "NEAR_EXPIRY"
                  ? CalendarClock
                  : AlertTriangle;
            return (
              <button
                key={item.id}
                type="button"
                className="text-left"
                onClick={() => navigate("pharmacy", "product", { id: item.id })}
              >
                <Card className="h-full hover:border-primary/40">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.strength ?? item.dosageForm.name} · SKU {item.sku}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <span>
                          Available{" "}
                          <strong className="tabular-nums">{item.availableQuantity}</strong>
                        </span>
                        <span>
                          Reserved <strong className="tabular-nums">{item.reservedQuantity}</strong>
                        </span>
                        {nextLot && (
                          <span>
                            Next expiry <strong>{formatDate(nextLot.expiryDate)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add inventory location</DialogTitle>
            <DialogDescription>
              Locations separate stock balances without tying the platform to a particular warehouse
              model.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField
              label="Location code"
              value={locationForm.code}
              onChange={(code) => setLocationForm({ ...locationForm, code })}
            />
            <FormField
              label="Location name"
              value={locationForm.name}
              onChange={(name) => setLocationForm({ ...locationForm, name })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void createLocation()}>
              Create location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>
              Batch, location, quantity, and expiry are recorded as immutable inventory evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <SelectField
              label="Product"
              value={receive.catalogItemId}
              onChange={(catalogItemId) => setReceive({ ...receive, catalogItemId })}
              options={items.map((item) => ({ id: item.id, name: `${item.name} · ${item.sku}` }))}
            />
            <SelectField
              label="Location"
              value={receive.locationId}
              onChange={(locationId) => setReceive({ ...receive, locationId })}
              options={locations}
            />
            <FormField
              label="Batch number"
              value={receive.batchNumber}
              onChange={(batchNumber) => setReceive({ ...receive, batchNumber })}
            />
            <FormField
              label="Quantity"
              value={receive.quantity}
              onChange={(quantity) => setReceive({ ...receive, quantity })}
              inputMode="decimal"
            />
            <FormField
              label="Expiry date"
              value={receive.expiryDate}
              onChange={(expiryDate) => setReceive({ ...receive, expiryDate })}
              type="date"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void receiveStock()}>
              Record receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function label(view: View) {
  return {
    LOW_STOCK: "Low stock",
    OUT_OF_STOCK: "Out of stock",
    NEAR_EXPIRY: "Near expiry",
    ALL: "All active",
  }[view];
}
function FormField({
  label: text,
  onChange,
  value,
  ...props
}: { label: string; onChange: (value: string) => void; value: string } & Pick<
  React.ComponentProps<typeof Input>,
  "inputMode" | "type"
>) {
  return (
    <div className="space-y-1.5">
      <Label>{text}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </div>
  );
}
function SelectField({
  label: text,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{text}</Label>
      <select
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {text.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
