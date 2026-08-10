"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDateTime, nextOrderStatuses, ORDER_STATUSES } from "@/lib/format";
import {
  ArrowLeft, Truck, MapPin, Package, CheckCircle2, Wallet, Receipt,
  Building2, User, ShieldCheck, Clock,
} from "lucide-react";
import { toast } from "sonner";

// Full timeline order (matches ORDER_FLOW in format.ts)
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

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.createdAt)}`}
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Orders", onClick: () => navigate("pharmacy", "orders") },
          { label: order.orderNumber },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      {/* Status banner */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={order.status} />
        <span className="text-xs text-muted-foreground">
          Payment: <span className="font-medium capitalize">{order.paymentStatus}</span>
        </span>
        {order.verificationCode && (
          <span className="text-xs rounded bg-muted px-2 py-0.5">
            Verification code: <span className="font-mono font-medium">{order.verificationCode}</span>
          </span>
        )}
      </div>

      {/* Logistics takeover notice */}
      {(order.status === "ready_for_pickup" || order.status === "picked_up" || order.status === "in_transit" || order.status === "delivered") && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
          <Truck className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-sky-900">Logistics handles delivery</p>
            <p className="text-xs text-sky-700 mt-0.5">
              From this point onward, the assigned logistics provider manages pickup, transit and
              delivery. Track progress in the Deliveries page.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: items with commission breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-500" /> Order items & commission breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Comm. %</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Pharmacy net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.productName}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.gross)}</TableCell>
                        <TableCell className="text-right">{it.commissionPct}%</TableCell>
                        <TableCell className="text-right text-rose-700">-{formatCurrency(it.commissionAmount)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">{formatCurrency(it.pharmacyNet)}</TableCell>
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

              {/* Totals */}
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (gross)</span>
                  <span className="font-medium">{formatCurrency(subtotal || order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform commission ({order.pharmacy?.commissionPct ?? "—"}%)</span>
                  <span className="font-medium text-rose-700">-{formatCurrency(commissionTotal || order.commissionTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pharmacy net (before delivery fee)</span>
                  <span className="font-medium text-emerald-700">{formatCurrency(pharmacyNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery fee</span>
                  <span>{formatCurrency(order.deliveryFee)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-semibold">Order total</span>
                  <span className="font-bold text-lg">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workflow progression */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-500" /> Fulfilment workflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Timeline */}
              <ol className="relative border-l border-border ml-3 space-y-4 mb-5">
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
                            ? "bg-sky-500 border-sky-500"
                            : "bg-background border-border"
                        }`}
                      >
                        {done && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${current ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </p>
                        <span
                          className={`text-[10px] rounded px-1.5 py-0.5 ${
                            step.owner === "pharmacy"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {step.owner === "pharmacy" ? "Pharmacy" : "Logistics"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </li>
                  );
                })}
              </ol>

              {/* Progression buttons */}
              {!isTerminal && nextSteps.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Available actions:</p>
                  <div className="flex flex-wrap gap-2">
                    {nextSteps.map((s) => {
                      const isReject = s === "rejected" || s === "cancelled";
                      const isClarification = s === "clarification_required";
                      const isPartial = s === "partially_available";
                      const tone = isReject
                        ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800 border-rose-200"
                        : isClarification
                        ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800 border-amber-200"
                        : isPartial
                        ? "text-violet-700 hover:bg-violet-50 hover:text-violet-800 border-violet-200"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600";
                      return (
                        <Button
                          key={s}
                          variant={isReject || isClarification || isPartial ? "outline" : "default"}
                          className={tone}
                          disabled={busy}
                          onClick={() => handleProgress(s)}
                        >
                          {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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
            </CardContent>
          </Card>
        </div>

        {/* Right: order summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-sky-500" /> Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patient No.</span>
                <span>{order.patient?.patientNumber ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{order.patient?.phone ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          {order.deliveryAddress && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-amber-500" /> Delivery address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{order.deliveryAddress}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-500" /> Pharmacy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pharmacy</span>
                <span className="font-medium">{order.pharmacy?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch</span>
                <span>{order.pharmacy ? `${order.pharmacy.city}, ${order.pharmacy.state}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{order.pharmacy?.phone ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-500" /> Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{order.paymentStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order total</span>
                <span className="font-medium">{formatCurrency(order.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pharmacy net</span>
                <span className="font-medium text-emerald-700">{formatCurrency(pharmacyNet)}</span>
              </div>
            </CardContent>
          </Card>

          {order.prescription && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-sky-500" /> Linked prescription
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rx number</span>
                  <span className="font-medium">{order.prescription.prescriptionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={order.prescription.status} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
