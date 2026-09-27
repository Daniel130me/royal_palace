"use client";

import { useEffect, useState, useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyService, pharmacyOrderService } from "@/lib/services";
import { usePatientContext } from "../use-patient-context";
import type { Pharmacy, PharmacyProduct } from "@/types";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  Pill, MapPin, Phone, Star, ShieldCheck, Search, Lock, ShoppingCart, Plus, Minus, AlertCircle,
} from "lucide-react";

interface CartLine { productId: string; productName: string; unitPrice: number; quantity: number; controlled: boolean; }

export function PatientPharmacyDetail() {
  const { view } = useNav();
  const id = view.params.id;
  const { profile } = usePatientContext();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "otc" | "controlled">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([pharmacyService.get(id), pharmacyService.products(id)]).then(([p, prods]) => {
      if (cancelled) return;
      setPharmacy(p);
      setProducts(prods.filter((x) => x.status === "active"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (profile) setAddress(`${profile.firstName} ${profile.lastName}, ${profile.city}, ${profile.state}`);
  }, [profile]);

  const filtered = useMemo(() => products.filter((p) => {
    if (filter === "otc" && p.controlled) return false;
    if (filter === "controlled" && !p.controlled) return false;
    if (q && !`${p.name} ${p.genericName} ${p.category}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [products, q, filter]);

  const cartLines: CartLine[] = Object.entries(cart)
    .map(([pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return p ? { productId: pid, productName: `${p.name} ${p.strength}`, unitPrice: p.price, quantity: qty, controlled: p.controlled } : null;
    })
    .filter(Boolean) as CartLine[];

  const cartTotal = cartLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const deliveryFee = 1500;
  const hasControlled = cartLines.some((l) => l.controlled);

  function setQty(pid: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[pid] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[pid];
      else copy[pid] = next;
      return copy;
    });
  }

  async function submitOrder() {
    if (!profile || !pharmacy) return;
    if (cartLines.length === 0) return;
    if (hasControlled) {
      toast.error("Your cart contains a controlled medication. Please remove it or order it via a doctor's prescription.");
      return;
    }
    if (!address.trim()) {
      toast.error("Please enter a delivery address.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await pharmacyOrderService.directOrder({
        patientId: profile.id,
        pharmacyId: pharmacy.id,
        items: cartLines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        deliveryAddress: address,
        deliveryFee,
      });
      toast.success(`Order ${order.orderNumber} placed!`);
      setCart({});
      setCheckoutOpen(false);
      navigate("patient", "order", { id: order.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <SkeletonGrid count={4} />;
  if (!pharmacy) return <EmptyState title="Pharmacy not found" />;

  return (
    <div className="space-y-5 pb-28">
      <PageHeader title={pharmacy.name} description={pharmacy.address} back />

      {/* Pharmacy info card */}
      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-2.5 ring-1 ring-amber-100">
              <Pill className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold">{pharmacy.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {pharmacy.verificationStatus === "approved" && <span className="flex items-center gap-0.5 text-emerald-600"><ShieldCheck className="h-3 w-3" /> Verified</span>}
                <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{pharmacy.rating}</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p className="flex items-center gap-1 justify-end"><MapPin className="h-3 w-3" />{pharmacy.city}, {pharmacy.state}</p>
            <p className="flex items-center gap-1 justify-end mt-1"><Phone className="h-3 w-3" />{pharmacy.phone}</p>
          </div>
        </div>
      </SectionCard>

      {/* Search + filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="Search medicines…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as "all" | "otc" | "controlled")}
        options={[
          { value: "all", label: "All" },
          { value: "otc", label: "OTC (direct)" },
          { value: "controlled", label: "Rx only" },
        ]}
      />

      {/* Products list */}
      {filtered.length === 0 ? (
        <EmptyState icon={Pill} title="No products found" compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{p.name} {p.strength}</p>
                    {p.controlled ? (
                      <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 shrink-0">
                        <Lock className="h-2.5 w-2.5 mr-0.5" /> Rx
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">OTC</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.category} · {p.dosageForm}</p>
                  <p className="text-sm font-semibold text-primary mt-0.5">{formatCurrency(p.price)}</p>
                </div>
                {p.controlled ? (
                  <span className="text-[10px] text-rose-600 text-right max-w-[100px] leading-tight">Requires prescription</span>
                ) : qty === 0 ? (
                  <Button size="iconSm" variant="outline" onClick={() => setQty(p.id, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button size="iconSm" variant="outline" onClick={() => setQty(p.id, -1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                    <Button size="iconSm" variant="outline" onClick={() => setQty(p.id, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Controlled medication notice */}
      {filter === "all" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Medicines marked <strong>Rx</strong> are <strong>controlled</strong> and require a doctor's prescription.
            You can order <strong>OTC</strong> medicines directly. To order a controlled medicine, consult a doctor or upload a paper prescription.
          </p>
        </div>
      )}

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
            <DialogDescription>Review your OTC order and confirm delivery.</DialogDescription>
          </DialogHeader>
          {hasControlled && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              Your cart contains a controlled medication. Remove it to continue, or order it via a prescription.
            </div>
          )}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {cartLines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between text-sm">
                <span className="truncate">{l.productName} × {l.quantity}</span>
                <span className="font-medium">{formatCurrency(l.unitPrice * l.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addr">Delivery address</Label>
            <Textarea id="addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1 text-sm border-t pt-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(cartTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatCurrency(deliveryFee)}</span></div>
            <div className="flex justify-between font-semibold text-base"><span>Total</span><span className="text-primary">{formatCurrency(cartTotal + deliveryFee)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button onClick={submitOrder} disabled={submitting || hasControlled || cartLines.length === 0}>
              {submitting ? "Placing…" : `Pay ${formatCurrency(cartTotal + deliveryFee)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky bottom bar with cart total */}
      {cartLines.length > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-30 lg:bottom-6 lg:max-w-md lg:left-1/2 lg:-translate-x-1/2 px-4">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="w-full flex items-center justify-between rounded-xl bg-primary text-primary-foreground px-4 py-3 shadow-soft-lg active:scale-[0.99] tap-highlight-none"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="h-4 w-4" />
              {cartLines.length} item{cartLines.length > 1 ? "s" : ""}
            </span>
            <span className="text-sm font-bold">{formatCurrency(cartTotal + deliveryFee)} →</span>
          </button>
        </div>
      )}
    </div>
  );
}
