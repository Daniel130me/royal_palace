"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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
  const commissionTotal = items.reduce((s, i) => s + i.commissionAmount, 0);
  const pharmacyNet = items.reduce((s, i) => s + i.pharmacyNet, 0);

  const primaryNext = nextSteps.find((s) => !["rejected", "cancelled", "clarification_required", "partially_available"].includes(s)) ?? null;

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.createdAt)}`}
        back
        actions={<StatusBadge status={order.status} />}
      />

      {/* Status banner */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2.5">
          <Truck className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-sky-900">Logistics handles delivery</p>
            <p className="text-xs text-sky-700 mt-0.5 leading-relaxed">
              From this point onward, the assigned logistics provider manages pickup, transit and delivery.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Items + commission breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Order items & commission"
            description="Per-item commission breakdown"
            icon={Package}
            dense
          >
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Comm %</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Pharmacy net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(it.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(it.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums">{it.commissionPct}%</TableCell>
                      <TableCell className="text-right text-rose-700 tabular-nums">-{formatCurrency(it.commissionAmount)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(it.pharmacyNet)}</TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                        No items in this order.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile per-item cards */}
            <ul className="md:hidden divide-y divide-border/60">
              {items.map((it) => (
                <li key={it.id} className="p-4">
                  <p className="text-sm font-semibold leading-tight">{it.productName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Qty {it.quantity} · {formatCurrency(it.unitPrice)} each</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross</p>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(it.gross)}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100">
                      <p className="text-[10px] text-rose-700 uppercase tracking-wider">Comm ({it.commissionPct}%)</p>
                      <p className="text-sm font-semibold text-rose-700 tabular-nums">-{formatCurrency(it.commissionAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
                      <p className="text-[10px] text-emerald-700 uppercase tracking-wider">Net</p>
                      <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(it.pharmacyNet)}</p>
                    </div>
                  </div>
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-center text-sm text-muted-foreground py-6">No items in this order.</li>
              )}
            </ul>

            {/* Totals */}
            <div className="border-t border-border/60 px-4 sm:px-5 py-4 space-y-1.5 text-sm bg-muted/20">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (gross)</span>
                <span className="font-medium tabular-nums">{formatCurrency(subtotal || order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform commission ({order.pharmacy?.commissionPct ?? "—"}%)</span>
                <span className="font-medium text-rose-700 tabular-nums">-{formatCurrency(commissionTotal || order.commissionTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pharmacy net (before delivery fee)</span>
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
            <ol className="relative border-l-2 border-border ml-2 space-y-5 mb-5">
              {TIMELINE.map((step, idx) => {
                const done = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                  <li key={step.status} className="ml-5">
                    <span
                      className={`absolute -left-[10px] flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        done
                          ? "bg-emerald-500 border-emerald-500"
                          : current
                          ? "bg-primary border-primary ring-4 ring-primary/20"
                          : "bg-background border-border"
                      }`}
                    >
                      {done && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      {current && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
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
        </div>

        {/* Right: summary cards */}
        <div className="space-y-6">
          <SectionCard title="Patient" icon={User}>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {order.patient ? initials(`${order.patient.firstName} ${order.patient.lastName}`) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : "—"}</p>
                <p className="text-xs text-muted-foreground">{order.patient?.patientNumber ?? "—"}</p>
              </div>
            </div>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="text-right">{order.patient?.phone ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          {order.deliveryAddress && (
            <SectionCard title="Delivery address" icon={MapPin}>
              <p className="text-sm leading-relaxed">{order.deliveryAddress}</p>
            </SectionCard>
          )}

          <SectionCard title="Pharmacy" icon={Building2}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pharmacy</dt>
                <dd className="font-medium text-right">{order.pharmacy?.name ?? "—"}</dd>
              </div>
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

          <SectionCard title="Payment" icon={Wallet}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{order.paymentStatus}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Order total</dt>
                <dd className="font-medium tabular-nums">{formatCurrency(order.total)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pharmacy net</dt>
                <dd className="font-medium text-emerald-700 tabular-nums">{formatCurrency(pharmacyNet)}</dd>
              </div>
            </dl>
          </SectionCard>

          {order.prescription && (
            <SectionCard title="Linked prescription" icon={ShieldCheck}>
              <dl className="text-sm space-y-2.5">
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
      </div>

      {/* Mobile bottom bar with primary action */}
      {!isTerminal && primaryNext && (
        <BottomActionBar>
          <Button className="w-full" disabled={busy} onClick={() => handleProgress(primaryNext)}>
            <CheckCircle2 className="h-4 w-4" /> {humanise(primaryNext)}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}
