"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { prescriptionService, pharmacyService, pharmacyOrderService } from "@/lib/services";
import type { Prescription, Pharmacy, PharmacyProduct, PrescriptionItem } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard, BottomActionBar } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
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
  Pill, Building2, ShoppingCart,
  Check, Lock, Stethoscope, Calendar, FileText, Minus, Plus,
  User, StickyNote, Clock, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, fullName, age } from "@/lib/format";
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
    let cancelled = false;
    setLoading(true);
    prescriptionService.get(id)
      .then((r) => { if (!cancelled) setRx(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Prescription not found"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
  const canOrderFromStatus = ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(rx.status);
  const patientAge = rx.patient?.dateOfBirth ? age(rx.patient.dateOfBirth) : (profile?.dateOfBirth ? age(profile.dateOfBirth) : null);
  const patient = rx.patient ?? profile ?? null;

  return (
    <div className="space-y-6 pb-32 lg:pb-0">
      <PageHeader
        title={rx.prescriptionNumber}
        description={`Issued ${formatDate(rx.validityStartDate)} · expires ${formatDate(rx.expiryDate)}`}
        back
        actions={
          orderable ? (
            <Button disabled={!canOrderFromStatus} onClick={() => setOrderOpen(true)} className="hidden lg:inline-flex bg-emerald-600 hover:bg-emerald-700">
              <ShoppingCart className="h-4 w-4" /> Order medicines
            </Button>
          ) : undefined
        }
      />

      {/* Status banner */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={rx.status} />
        <Badge variant="outline" className="text-[10px] h-6 px-2 bg-muted/40">
          <Clock className="h-3 w-3 mr-1" />
          {formatDate(rx.validityStartDate)} → {formatDate(rx.expiryDate)}
        </Badge>
        {rx.items?.length ? (
          <Badge variant="outline" className="text-[10px] h-6 px-2 bg-muted/40">
            <Pill className="h-3 w-3 mr-1" />
            {rx.items.length} medicine{(rx.items.length ?? 0) === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Patient */}
          <SectionCard title="Patient" icon={User}>
            <dl className="text-sm space-y-2.5">
              <Row label="Name" value={patient ? `${patient.firstName} ${patient.lastName}` : "—"} />
              <Row label="Patient number" value={patient?.patientNumber ?? "—"} />
              <Row
                label="Age"
                value={patientAge != null ? `${patientAge} yrs` : "—"}
              />
              <Row label="Gender" value={patient?.gender ?? "—"} />
              {patient ? (
                <Row label="Location" value={`${patient.city}, ${patient.state}`} />
              ) : null}
            </dl>
          </SectionCard>

          {/* Prescriber */}
          <SectionCard title="Prescriber" icon={Stethoscope}>
            <dl className="text-sm space-y-2.5">
              <Row label="Doctor" value={rx.provider ? fullName(rx.provider) : "—"} />
              <Row label="Title" value={rx.provider?.professionalTitle ?? rx.provider?.title ?? "—"} />
              <Row label="Specialty" value={rx.provider?.specialty ?? "—"} />
              <Row label="Provider number" value={rx.provider?.providerNumber ?? "—"} />
              {rx.encounterId ? (
                <Row label="Consultation" value={`Encounter ${rx.encounterId}`} />
              ) : null}
              <Row label="Issued on" value={formatDate(rx.validityStartDate)} />
              <Row label="Status" value={<StatusBadge status={rx.status} size="sm" />} />
            </dl>
          </SectionCard>

          {/* Pharmacy */}
          <SectionCard title="Pharmacy" icon={Building2}>
            {rx.pharmacyId && rx.pharmacy ? (
              <dl className="text-sm space-y-2.5">
                <Row label="Pharmacy" value={rx.pharmacy.name} />
                <Row label="Address" value={rx.pharmacy.address} multiline />
                <Row label="City" value={`${rx.pharmacy.city}, ${rx.pharmacy.state}`} />
                <Row label="Phone" value={rx.pharmacy.phone} />
                {rx.pharmacy.verificationStatus === "approved" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 pt-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified pharmacy
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <div className="rounded-lg bg-muted/60 p-1.5 shrink-0">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Not yet sent to a pharmacy</p>
                  <p className="text-xs mt-0.5">
                    Use <span className="font-medium text-foreground">Order medicines</span> below to choose a verified pharmacy and have it delivered.
                  </p>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Doctor's note (emerald callout) */}
          {rx.doctorNote && rx.doctorNote.trim() ? (
            <SectionCard title="Doctor's note" icon={StickyNote} className="border-emerald-200 bg-emerald-50/40">
              <div className="rounded-lg border border-emerald-200/80 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-900 leading-relaxed whitespace-pre-wrap">
                  {rx.doctorNote}
                </p>
              </div>
            </SectionCard>
          ) : null}

          {/* Medicines */}
          <SectionCard title={`Medicines (${rx.items?.length ?? 0})`} icon={Pill} dense>
            {(rx.items ?? []).length === 0 ? (
              <div className="p-5"><p className="text-sm text-muted-foreground">No items on this prescription.</p></div>
            ) : (
              <ul className="divide-y divide-border/60">
                {rx.items!.map((it, idx) => <MedicineItem key={it.id} item={it} index={idx + 1} />)}
              </ul>
            )}
          </SectionCard>

          {/* Notes (general) */}
          {rx.notes && rx.notes.trim() ? (
            <SectionCard title="Notes" icon={FileText}>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{rx.notes}</p>
            </SectionCard>
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Pharmacy status" icon={Building2}>
            <dl className="text-sm space-y-2.5">
              <Row label="Current status" value={<StatusBadge status={rx.status} size="sm" />} />
              <Row label="Issued" value={formatDate(rx.validityStartDate)} />
              <Row label="Expires" value={formatDate(rx.expiryDate)} />
              <Row label="Items" value={`${rx.items?.length ?? 0} medicine(s)`} />
              {rx.pharmacy ? (
                <Row label="Assigned pharmacy" value={rx.pharmacy.name} />
              ) : (
                <Row label="Assigned pharmacy" value={<span className="text-amber-600">Not assigned</span>} />
              )}
            </dl>
          </SectionCard>

          {/* Validity period card */}
          <SectionCard title="Validity period" icon={Calendar}>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="rounded-lg bg-emerald-50 p-1.5 ring-1 ring-emerald-100 shrink-0">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Issued</p>
                  <p className="text-sm font-medium">{formatDate(rx.validityStartDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="rounded-lg bg-rose-50 p-1.5 ring-1 ring-rose-100 shrink-0">
                  <Lock className="h-3.5 w-3.5 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expires</p>
                  <p className="text-sm font-medium">{formatDate(rx.expiryDate)}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Quick order help card */}
          <SectionCard title="Need to reorder?" icon={ShoppingCart}>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Order medicines from a verified pharmacy with same-day home delivery. Your prescription is sent securely.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={!canOrderFromStatus}
              onClick={() => setOrderOpen(true)}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> {canOrderFromStatus ? "Order medicines" : "Cannot order"}
            </Button>
          </SectionCard>
        </div>
      </div>

      {/* Mobile bottom action bar — Order medicines CTA */}
      {orderable && (
        <BottomActionBar>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">{rx.items?.length ?? 0} medicine(s) ready</p>
              <p className="text-sm font-semibold leading-tight">Tap to order</p>
            </div>
            <Button disabled={!canOrderFromStatus} onClick={() => setOrderOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <ShoppingCart className="h-4 w-4" /> Order
            </Button>
          </div>
        </BottomActionBar>
      )}

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

function MedicineItem({ item: it, index }: { item: PrescriptionItem; index: number }) {
  return (
    <li className="px-4 sm:px-5 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground/70">#{index}</span>
            <p className="font-medium text-sm truncate">{it.medicine} {it.strength}</p>
          </div>
          {it.genericName ? (
            <p className="text-xs text-muted-foreground mt-0.5">{it.genericName}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-0.5">{it.dosageForm} · {it.route}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">Qty {it.quantity}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 bg-card">Dose: {it.dose}</Badge>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 bg-card">{it.frequency}</Badge>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 bg-card">{it.duration}</Badge>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 bg-card">Refills: {it.refillAllowance}</Badge>
        <Badge
          variant="outline"
          className={`text-[10px] h-5 px-1.5 gap-0.5 bg-card ${it.substitutionAllowed ? "text-emerald-700 border-emerald-200" : "text-amber-700 border-amber-200"}`}
        >
          {it.substitutionAllowed ? "Substitution allowed" : "No substitution"}
        </Badge>
      </div>
      {it.instructions && (
        <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">{it.instructions}</p>
      )}
    </li>
  );
}

function Row({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={`font-medium text-right ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>{value}</dd>
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
    let cancelled = false;
    pharmacyService.list().then((p) => { if (!cancelled) setPharmacies(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!pharmacyId) { setProducts([]); return; }
    let cancelled = false;
    setLoadingProducts(true);
    pharmacyService.products(pharmacyId)
      .then((p) => { if (!cancelled) setProducts(p); })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
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
      <SheetContent side="bottom" className="max-h-[92vh] flex flex-col rounded-t-3xl sm:max-w-md sm:mx-auto sm:rounded-2xl">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <SheetTitle className="text-left text-base">Order medicines</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Select pharmacy</Label>
            <Select value={pharmacyId} onValueChange={setPharmacyId}>
              <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder="Choose a pharmacy" /></SelectTrigger>
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Matching medicines</p>
              {loadingProducts ? (
                <p className="text-sm text-muted-foreground">Loading products…</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items on this prescription.</p>
              ) : (
                matches.map(({ item, candidates }) => {
                  const prod = candidates[0];
                  const qty = quantities[item.id] ?? item.quantity;
                  return (
                    <div key={item.id} className="rounded-xl border p-3">
                      <p className="text-sm font-medium">{item.medicine} {item.strength}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Prescribed: {item.quantity} units</p>
                      {prod ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs truncate">{prod.name} {prod.strength}</p>
                            <p className="text-xs text-primary font-semibold">{formatCurrency(prod.price)}</p>
                            {prod.stockQuantity < item.quantity && (
                              <p className="text-[10px] text-amber-600 mt-0.5">Low stock ({prod.stockQuantity} available)</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setQuantities((q) => ({ ...q, [item.id]: Math.max(1, (q[item.id] ?? item.quantity) - 1) }))}
                              className="h-8 w-8 rounded-md border bg-card text-sm flex items-center justify-center tap-highlight-none"
                              aria-label="Decrease quantity"
                            ><Minus className="h-3 w-3" /></button>
                            <span className="w-8 text-center text-sm font-medium">{qty}</span>
                            <button
                              onClick={() => setQuantities((q) => ({ ...q, [item.id]: (q[item.id] ?? item.quantity) + 1 }))}
                              className="h-8 w-8 rounded-md border bg-card text-sm flex items-center justify-center tap-highlight-none"
                              aria-label="Increase quantity"
                            ><Plus className="h-3 w-3" /></button>
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
            <Label className="text-xs text-muted-foreground">Delivery address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="House number, street, area, city" className="mt-1.5" />
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className="font-medium">{formatCurrency(deliveryFee)}</span></div>
            <div className="flex justify-between border-t border-border/80 pt-2 mt-1"><span className="font-semibold">Total</span><span className="font-bold text-base text-primary">{formatCurrency(total)}</span></div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-700 flex items-center gap-1.5">
            <Lock className="h-3 w-3 shrink-0" /> Prototype — no real payment is processed.
          </div>
        </div>
        <SheetFooter className="p-4 border-t border-border/60 shrink-0">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button disabled={busy || !pharmacyId} onClick={placeOrder} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Placing…" : `Pay ${formatCurrency(total)}`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
