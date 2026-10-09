"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { History, PackageOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatDateTime, formatMinorCurrency } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Item = PrescriptionComponents["schemas"]["PharmacyCatalogItem"];
type Lot = PrescriptionComponents["schemas"]["InventoryLot"];
type Movement = PrescriptionComponents["schemas"]["InventoryMovement"];

export function PharmacyProductDetail() {
  const { session, view } = useNav();
  const organizationId = session?.profileId;
  const itemId = view.params.id;
  const [item, setItem] = useState<Item | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustLot, setAdjustLot] = useState<Lot | null>(null);
  const [adjustment, setAdjustment] = useState({
    quantity: "",
    reasonCode: "",
    type: "ADJUST_IN" as "ADJUST_IN" | "ADJUST_OUT" | "RETURN" | "WRITE_OFF",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !itemId) {
      setError("Product reference or pharmacy membership is missing");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [product, lotPage, movementPage] = await Promise.all([
        productionPrescriptionService.pharmacy.catalogItem(organizationId, itemId),
        productionPrescriptionService.pharmacy.inventoryLots(organizationId, {
          catalogItemId: itemId,
          limit: 50,
        }),
        productionPrescriptionService.pharmacy.inventoryMovements(organizationId, {
          catalogItemId: itemId,
          limit: 25,
        }),
      ]);
      setItem(product);
      setLots([...lotPage.data]);
      setMovements([...movementPage.data]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [itemId, organizationId]);

  useEffect(() => void load(), [load]);

  async function recordAdjustment() {
    if (!organizationId || !item || !adjustLot) return;
    setSaving(true);
    try {
      await productionPrescriptionService.pharmacy.recordInventoryMovement(organizationId, {
        catalogItemId: item.id,
        expectedLotVersion: adjustLot.version,
        idempotencyKey: crypto.randomUUID(),
        locationId: adjustLot.location.id,
        lotId: adjustLot.id,
        quantity: adjustment.quantity,
        reasonCode: adjustment.reasonCode,
        type: adjustment.type,
      });
      toast.success("Inventory adjustment recorded");
      setAdjustLot(null);
      setAdjustment({ quantity: "", reasonCode: "", type: "ADJUST_IN" });
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Adjustment could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading product…" />;
  if (error || !item)
    return (
      <EmptyState title="Product unavailable" description={error ?? "Product was not found"} />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={item.name}
        description={`${item.strength ?? "Strength not specified"} · ${item.dosageForm.name} · SKU ${item.sku}`}
        actions={<StatusBadge status={item.status.toLowerCase()} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Unit price"
          value={formatMinorCurrency(item.unitPriceMinor, item.currency)}
        />
        <Metric label="On hand" value={item.onHandQuantity} />
        <Metric label="Reserved" value={item.reservedQuantity} />
        <Metric label="Available" value={item.availableQuantity} warning={item.lowStock} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <SectionCard
          title="Stock lots"
          description="Expiry-ordered batch balances"
          icon={PackageOpen}
          dense
        >
          {lots.length === 0 ? (
            <EmptyState
              title="No stock lots"
              description="Receive stock from the Inventory page."
              compact
            />
          ) : (
            <div className="divide-y">
              {lots.map((lot) => (
                <div key={lot.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">Batch {lot.batchNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {lot.location.name} · expires {formatDate(lot.expiryDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">
                        {lot.availableQuantity} available
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lot.reservedQuantity} reserved
                      </p>
                    </div>
                    {lot.status === "AVAILABLE" && (
                      <Button size="sm" variant="outline" onClick={() => setAdjustLot(lot)}>
                        Adjust
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Product details">
          <dl className="grid gap-3 text-sm">
            <Detail label="Category" value={item.category.name} />
            <Detail label="Generic name" value={item.genericName ?? "—"} />
            <Detail label="Brand" value={item.brandName ?? "—"} />
            <Detail label="Manufacturer" value={item.manufacturer ?? "—"} />
            <Detail
              label="Prescription"
              value={item.prescriptionRequired ? "Required" : "Not required"}
            />
            <Detail label="Storage" value={item.storageRequirements ?? "—"} />
            <Detail label="Low-stock threshold" value={item.lowStockThreshold} />
            <Detail label="Near-expiry window" value={`${item.nearExpiryDays} days`} />
          </dl>
        </SectionCard>
      </div>
      <SectionCard
        title="Movement history"
        description="Immutable, newest-first stock evidence"
        icon={History}
        dense
      >
        {movements.length === 0 ? (
          <EmptyState
            title="No movements"
            description="Receipts and adjustments will appear here."
            compact
          />
        ) : (
          <div className="divide-y">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="grid gap-1 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium">{movement.type.replaceAll("_", " ")}</p>
                  <p className="text-sm text-muted-foreground">
                    {movement.reasonCode.replaceAll("_", " ")} ·{" "}
                    {formatDateTime(movement.occurredAt)}
                  </p>
                </div>
                <p className="text-sm tabular-nums">
                  {movement.quantity} → {movement.onHandAfter} on hand
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <Dialog open={adjustLot !== null} onOpenChange={(open) => !open && setAdjustLot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust batch {adjustLot?.batchNumber}</DialogTitle>
            <DialogDescription>
              Every adjustment requires a reason and is stored as immutable audit evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Adjustment type</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={adjustment.type}
                onChange={(event) =>
                  setAdjustment({
                    ...adjustment,
                    type: event.target.value as typeof adjustment.type,
                  })
                }
              >
                <option value="ADJUST_IN">Increase after count</option>
                <option value="ADJUST_OUT">Decrease after count</option>
                <option value="RETURN">Patient return to stock</option>
                <option value="WRITE_OFF">Write off</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                inputMode="decimal"
                value={adjustment.quantity}
                onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason code</Label>
              <Input
                placeholder="e.g. CYCLE_COUNT_CORRECTION"
                value={adjustment.reasonCode}
                onChange={(event) =>
                  setAdjustment({ ...adjustment, reasonCode: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustLot(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void recordAdjustment()}>
              Record adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${warning ? "text-amber-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
