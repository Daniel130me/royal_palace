"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { prescriptionService, pharmacyService, pharmacyOrderService } from "@/lib/services";
import type { Prescription, Pharmacy, PharmacyProduct, PrescriptionItem } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Pill, ChevronRight, ChevronLeft, Building2, ShoppingCart, CreditCard,
  Check, ArrowRight, Lock, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

export function PatientPrescriptionDetail() {
  const { view } = useNav();
  const { profile } = usePatientContext();
  const id = view.params?.id;
  const [rx, setRx] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    prescriptionService.get(id)
      .then(setRx)
      .catch((e) => setError(e instanceof Error ? e.message : "Prescription not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState label="Loading prescription…" />;
  if (error || !rx) return (
    <EmptyState
      title="Prescription not found"
      description={error ?? ""}
      action={<Button onClick={() => navigate("patient", "prescriptions")}>Back to prescriptions</Button>}
    />
  );

  const orderable = !["expired", "cancelled"].includes(rx.status);

  return (
    <div>
      <PageHeader
        title={rx.prescriptionNumber}
        description={`Issued ${formatDate(rx.validityStartDate)} · expires ${formatDate(rx.expiryDate)}`}
        breadcrumbs={[
          { label: "Prescriptions", onClick: () => navigate("patient", "prescriptions") },
          { label: rx.prescriptionNumber },
        ]}
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!orderable} onClick={() => setOrderOpen(true)}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Order medicines
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prescribed by</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Doctor" value={rx.provider ? fullName(rx.provider) : "—"} />
              <Row label="Specialty" value={rx.provider?.specialty ?? "—"} />
              <Row label="Consultation" value={rx.encounterId ? `Encounter ${rx.encounterId}` : "—"} />
              <Row label="Date" value={formatDate(rx.validityStartDate)} />
              <Row label="Status" value={<StatusBadge status={rx.status} />} />
              {rx.notes && <Row label="Notes" value={rx.notes} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Medicines ({rx.items?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(rx.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No items on this prescription.</p>
              ) : rx.items!.map((it) => <MedicineItem key={it.id} item={it} />)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Pharmacy status</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Current status" value={<StatusBadge status={rx.status} />} />
              <Row label="Validity" value={`${formatDate(rx.validityStartDate)} → ${formatDate(rx.expiryDate)}`} />
              {["issued", "awaiting_pharmacy"].includes(rx.status) && (
                <Button size="sm" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setOrderOpen(true)}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Order medicines
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OrderMedicinesSheet
        open={orderOpen}
        onOpenChange={setOrderOpen}
        rx={rx}
        patientId={profile?.id ?? ""}
        patientName={profile ? `${profile.firstName} ${profile.lastName}` : ""}
        defaultAddress={profile ? `${profile.city}, ${profile.state}` : ""}
      />
    </div>
  );
}

function MedicineItem({ item: it }: { item: PrescriptionItem }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{it.medicine} {it.strength}</p>
          <p className="text-xs text-muted-foreground">{it.dosageForm} · {it.route}</p>
        </div>
        <Badge variant="secondary" className="text-[10px]">Qty {it.quantity}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">Dose:</span> {it.dose}</span>
        <span><span className="font-medium text-foreground">Frequency:</span> {it.frequency}</span>
        <span><span className="font-medium text-foreground">Duration:</span> {it.duration}</span>
        <span><span className="font-medium text-foreground">Refills:</span> {it.refillAllowance}</span>
      </div>
      {it.instructions && (
        <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">{it.instructions}</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function OrderMedicinesSheet({
  open, onOpenChange, rx, patientId, patientName, defaultAddress,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  rx: Prescription; patientId: string; patientName: string; defaultAddress: string;
}) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmacyId, setPharmacyId] = useState("");
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [address, setAddress] = useState(defaultAddress);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    pharmacyService.list().then(setPharmacies).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!pharmacyId) { setProducts([]); return; }
    setLoadingProducts(true);
    pharmacyService.products(pharmacyId)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [pharmacyId]);

  const matches = useMemo(() => {
    return (rx.items ?? []).map((item) => {
      const candidates = products.filter((p) =>
        p.genericName?.toLowerCase() === item.genericName?.toLowerCase() ||
        p.name.toLowerCase().includes(item.medicine.toLowerCase())
      );
      return { item, candidates };
    });
  }, [rx, products]);

  const subtotal = useMemo(() =>
    matches.reduce((s, { item, candidates }) => {
      const prod = candidates[0];
      const qty = quantities[item.id] ?? item.quantity;
      return s + (prod ? prod.price * qty : 0);
    }, 0)
  , [matches, quantities]);

  const deliveryFee = 1500;
  const total = subtotal + deliveryFee;

  async function placeOrder() {
    if (!pharmacyId) { toast.error("Please select a pharmacy."); return; }
    if (!address.trim()) { toast.error("Please enter a delivery address."); return; }
    const items = matches
      .filter(({ candidates }) => candidates[0])
      .map(({ item, candidates }) => ({
        productId: candidates[0].id,
        quantity: quantities[item.id] ?? item.quantity,
        productName: candidates[0].name,
        unitPrice: candidates[0].price,
      }));
    if (items.length === 0) { toast.error("No matching medicines available at this pharmacy."); return; }
    setBusy(true);
    try {
      const order = await pharmacyOrderService.create({
        prescriptionId: rx.id,
        patientId,
        pharmacyId,
        items,
        deliveryAddress: address,
        deliveryFee,
        actorId: patientId,
      });
      toast.success(`Order ${order.orderNumber} placed`);
      onOpenChange(false);
      navigate("patient", "order", { id: order.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">Order medicines</SheetTitle>
        </SheetHeader>
        <div className="p-4 space-y-4">
          <div>
            <Label className="text-xs">Select pharmacy</Label>
            <Select value={pharmacyId} onValueChange={setPharmacyId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a pharmacy" /></SelectTrigger>
              <SelectContent>
                {pharmacies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pharmacyId && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Matching medicines</p>
              {loadingProducts ? (
                <p className="text-sm text-muted-foreground">Loading products…</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items on this prescription.</p>
              ) : (
                matches.map(({ item, candidates }) => {
                  const prod = candidates[0];
                  return (
                    <div key={item.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{item.medicine} {item.strength}</p>
                      <p className="text-xs text-muted-foreground">Prescribed: {item.quantity} units</p>
                      {prod ? (
                        <div className="mt-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs">{prod.name} {prod.strength}</p>
                            <p className="text-xs text-emerald-700 font-medium">{formatCurrency(prod.price)}</p>
                            {prod.stockQuantity < item.quantity && (
                              <p className="text-[10px] text-amber-600">Low stock ({prod.stockQuantity} available)</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setQuantities((q) => ({ ...q, [item.id]: Math.max(1, (q[item.id] ?? item.quantity) - 1) }))}
                              className="h-7 w-7 rounded border text-sm"
                            >–</button>
                            <span className="w-8 text-center text-sm">{quantities[item.id] ?? item.quantity}</span>
                            <button
                              onClick={() => setQuantities((q) => ({ ...q, [item.id]: (q[item.id] ?? item.quantity) + 1 }))}
                              className="h-7 w-7 rounded border text-sm"
                            >+</button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-rose-600">Not available at this pharmacy</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">Delivery address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="House number, street, area, city" />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span>{formatCurrency(deliveryFee)}</span></div>
            <div className="flex justify-between border-t pt-1.5 font-bold"><span>Total</span><span className="text-emerald-700">{formatCurrency(total)}</span></div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-[11px] text-amber-700 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Prototype — no real payment is processed.
          </div>
        </div>
        <SheetFooter className="p-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="mr-auto">Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !pharmacyId} onClick={placeOrder}>
            {busy ? "Placing order…" : `Pay ${formatCurrency(total)} & place order`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
