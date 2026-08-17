"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDateTime, nextOrderStatuses, initials } from "@/lib/format";
import {
  Truck, MapPin, Package, CheckCircle2, Wallet,
  Building2, User, ShieldCheck, Clock, Hash,
} from "lucide-react";
import { toast } from "sonner";

const TIMELINE: { status: string; label: string; description: string; owner: "pharmacy" | "logistics" }[] = [
  { status: "paid", label: "Paid", description: "Order placed & payment captured", owner: "pharmacy" },
  { status: "prescription_under_review", label: "Under review", description: "Pharmacy reviewing prescription", owner: "pharmacy" },
  { status: "accepted", label: "Accepted", description: "Pharmacy accepted the order", owner: "pharmacy" },
  { status: "preparing", label: "Preparing", description: "Medicines being packaged", owner: "pharmacy" },
  { status: "ready_for_pickup", label: "Ready for pickup", description: "Order ready for logistics pickup", owner: "pharmacy" },
  { status: "picked_up", label: "Picked up", description: "Order picked up by rider", owner: "logistics" },
  { status: "in_transit", label: "In transit", description: "Order en route to patient", owner: "logistics" },
  { status: "delivered", label: "Delivered", description: "Order delivered & confirmed", owner: "logistics" },
];

function timelineIndex(status: string): number {
  const idx = TIMELINE.findIndex((t) => t.status === status);
  return idx === -1 ? 0 : idx;
}

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PharmacyOrderDetail() {
  const { view, session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const id = view.params.id;
  const [order, setOrder] = useState<PharmacyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!id) return;
    setError(null);
    pharmacyOrderService
      .get(id)
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load order"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    pharmacyOrderService
      .get(id)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load order"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleProgress = async (next: string) => {
    if (!pharmacyId || !order) return;
    setBusy(true);
    try {
      const updated = await pharmacyOrderService.progress(order.id, next, pharmacyId);
      setOrder(updated);
      toast.success(`Order moved to ${next.replace(/_/g, " ")}.`, {
        description:
          next === "ready_for_pickup" || next === "picked_up"
            ? "Logistics will handle delivery from here."
            : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update order");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading order…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <ErrorState message="Order not found." />;

  const nextSteps = nextOrderStatuses(order.status);
  const currentIdx = timelineIndex(order.status);
  const isTerminal = order.status === "delivered" || order.status === "cancelled" || order.status === "rejected" || order.status === "refunded";

  const items = order.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.gross, 0);
  const pharmacyNet = items.reduce((s, i) => s + i.pharmacyNet, 0);

  const primaryNext = nextSteps.find((s) => !["rejected", "cancelled", "clarification_required", "partially_available"].includes(s)) ?? null;

  return (
    <div className="pb-28 lg:pb-0 space-y-5">
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.createdAt)}`}
        back
        actions={<StatusBadge status={order.status} />}
      />

      {/* Status banner — compact */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Payment: <span className="font-medium capitalize">{order.paymentStatus}</span>
        </span>
        {order.verificationCode && (
          <Badge variant="outline" className="font-mono text-xs gap-1">
            <Hash className="h-3 w-3" /> Code: {order.verificationCode}
          </Badge>
        )}
      </div>

      {(order.status === "ready_for_pickup" || order.status === "picked_up" || order.status === "in_transit" || order.status === "delivered") && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2.5">
          <Truck className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-sky-900">Logistics handles delivery</p>
            <p className="text-xs text-sky-700 mt-0.5 leading-relaxed">
              From here the assigned logistics provider manages pickup, transit and delivery.
            </p>
          </div>
        </div>
      )}

      {/* Order items as ExpandableCards (per-item earnings on expand) */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Order items · {items.length} item(s) · earnings breakdown
        </p>
        <div className="space-y-2">
          {items.map((it) => (
            <ExpandableCard
              key={it.id}
              leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><Package className="h-4 w-4 text-sky-600" /></div>}
              title={it.productName}
              subtitle={`Qty ${it.quantity} · ${formatCurrency(it.unitPrice)} each · Your earnings ${formatCurrency(it.pharmacyNet)}`}
              trailing={<span className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(it.gross)}</span>}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(it.gross)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                  <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Your earnings</p>
                  <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(it.pharmacyNet)}</p>
                </div>
              </div>
            </ExpandableCard>
          ))}
          {items.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6 rounded-xl border border-border/60 bg-card">
              No items in this order.
            </div>
          )}
        </div>
      </div>

      {/* Totals compact summary */}
      <SectionCard title="Order total" icon={Wallet} dense>
        <div className="px-4 sm:px-5 py-3 space-y-1.5 text-sm bg-muted/20">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal (gross)</span>
            <span className="font-medium tabular-nums">{formatCurrency(subtotal || order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your earnings (before delivery fee)</span>
            <span className="font-medium text-emerald-700 tabular-nums">{formatCurrency(pharmacyNet)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery fee</span>
            <span className="tabular-nums">{formatCurrency(order.deliveryFee)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between items-center">
            <span className="font-semibold">Order total</span>
            <span className="font-bold text-lg tabular-nums">{formatCurrency(order.total)}</span>
          </div>
        </div>
      </SectionCard>

      {/* Fulfilment timeline */}
      <SectionCard title="Fulfilment workflow" icon={Clock}>
        <ol className="relative border-l-2 border-border ml-2 space-y-4 mb-4">
          {TIMELINE.map((step, idx) => {
            const done = idx < currentIdx;
            const current = idx === currentIdx;
            return (
              <li key={step.status} className="ml-4">
                <span
                  className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    done
                      ? "bg-emerald-500 border-emerald-500"
                      : current
                      ? "bg-primary border-primary ring-4 ring-primary/20"
                      : "bg-background border-border"
                  }`}
                >
                  {done && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                  {current && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${current || done ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {current && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                      Current
                    </Badge>
                  )}
                  <Badge variant="outline" className={
                    step.owner === "pharmacy"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"
                      : "border-sky-200 bg-sky-50 text-sky-700 text-[10px]"
                  }>
                    {step.owner}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.description}</p>
              </li>
            );
          })}
        </ol>

        {!isTerminal && nextSteps.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available actions</p>
            <div className="flex flex-wrap gap-2">
              {nextSteps.map((s) => {
                const isReject = s === "rejected" || s === "cancelled";
                const isClarification = s === "clarification_required";
                const isPartial = s === "partially_available";
                return (
                  <Button
                    key={s}
                    variant={isReject || isClarification || isPartial ? "outline" : "default"}
                    className={
                      isReject ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800 border-rose-200" :
                      isClarification ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800 border-amber-200" :
                      isPartial ? "text-violet-700 hover:bg-violet-50 hover:text-violet-800 border-violet-200" : ""
                    }
                    disabled={busy}
                    onClick={() => handleProgress(s)}
                  >
                    {humanise(s)}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This order has reached a terminal state and cannot be progressed further.
          </p>
        )}
      </SectionCard>

      {/* Patient + delivery compact */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Patient" icon={User}>
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {order.patient ? initials(`${order.patient.firstName} ${order.patient.lastName}`) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold truncate">{order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : "—"}</p>
              <p className="text-xs text-muted-foreground">{order.patient?.patientNumber ?? "—"} · {order.patient?.phone ?? "—"}</p>
            </div>
          </div>
        </SectionCard>

        {order.deliveryAddress && (
          <SectionCard title="Delivery address" icon={MapPin}>
            <p className="text-sm leading-relaxed">{order.deliveryAddress}</p>
          </SectionCard>
        )}

        <SectionCard title="Pharmacy" icon={Building2}>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="text-right">{order.pharmacy ? `${order.pharmacy.city}, ${order.pharmacy.state}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="text-right">{order.pharmacy?.phone ?? "—"}</dd>
            </div>
          </dl>
        </SectionCard>

        {order.prescription && (
          <SectionCard title="Linked prescription" icon={ShieldCheck}>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Rx number</dt>
                <dd className="font-medium font-mono text-xs">{order.prescription.prescriptionNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <StatusBadge status={order.prescription.status} size="sm" />
              </div>
            </dl>
          </SectionCard>
        )}
      </div>

      {/* Mobile bottom bar with primary action */}
      {!isTerminal && primaryNext && (
        <BottomActionBar>
          <Button className="flex-1" disabled={busy} onClick={() => handleProgress(primaryNext)}>
            <CheckCircle2 className="h-4 w-4" /> {humanise(primaryNext)}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}
