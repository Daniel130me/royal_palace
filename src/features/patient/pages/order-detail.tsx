"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder, Delivery } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, ChevronRight, MapPin, Truck, CheckCircle2, Building2, Receipt,
  CircleDot, ChevronLeft,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { DELIVERY_STATUSES } from "@/lib/format";

const DELIVERY_STEPS: { key: string; label: string }[] = [
  { key: "assigned", label: "Order placed" },
  { key: "accepted", label: "Driver accepted" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
];

const ORDER_STEP_INDEX: Record<string, number> = {
  paid: 0, prescription_under_review: 0, clarification_required: 0, accepted: 0,
  partially_available: 0, rejected: 0, preparing: 1, ready_for_pickup: 1,
  picked_up: 2, in_transit: 3, delivered: 4, cancelled: -1, refunded: -1,
};

export function PatientOrderDetail() {
  const { view } = useNav();
  const id = view.params?.id;
  const [order, setOrder] = useState<PharmacyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    pharmacyOrderService.get(id)
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : "Order not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState label="Loading order…" />;
  if (error || !order) return (
    <EmptyState
      title="Order not found"
      description={error ?? ""}
      action={<Button onClick={() => navigate("patient", "orders")}>Back to orders</Button>}
    />
  );

  const delivery = order.delivery ?? null;
  const currentStep = ORDER_STEP_INDEX[order.status] ?? 0;

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(createdAt(order) ?? order.orderNumber)}`}
        breadcrumbs={[
          { label: "Orders", onClick: () => navigate("patient", "orders") },
          { label: order.orderNumber },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Items ({order.items?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(order.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No items on this order.</p>
              ) : order.items!.map((it) => (
                <div key={it.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{it.productName}</p>
                      <p className="text-xs text-muted-foreground">Qty {it.quantity} · {formatCurrency(it.unitPrice)} each</p>
                    </div>
                    <p className="font-semibold text-sm">{formatCurrency(it.gross)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div className="rounded bg-muted/40 p-1.5">
                      <p>Gross</p>
                      <p className="text-foreground font-medium">{formatCurrency(it.gross)}</p>
                    </div>
                    <div className="rounded bg-muted/40 p-1.5">
                      <p>Commission ({it.commissionPct}%)</p>
                      <p className="text-rose-600 font-medium">–{formatCurrency(it.commissionAmount)}</p>
                    </div>
                    <div className="rounded bg-muted/40 p-1.5">
                      <p>Pharmacy net</p>
                      <p className="text-emerald-700 font-medium">{formatCurrency(it.pharmacyNet)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Delivery + tracking */}
          {delivery ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Delivery tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center justify-between text-sm">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="font-medium">{delivery.pickupLocation}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 text-right">
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="font-medium">{delivery.deliveryLocation}</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted" />
                  <div
                    className="absolute top-4 left-4 h-0.5 bg-emerald-500 transition-all"
                    style={{ width: `calc(${Math.max(0, currentStep) * 25}% - 2rem)` }}
                  />
                  <ol className="relative grid grid-cols-5">
                    {DELIVERY_STEPS.map((s, i) => {
                      const done = i <= currentStep;
                      return (
                        <li key={s.key} className="flex flex-col items-center">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background ${
                            done ? "border-emerald-500 text-emerald-600" : "border-muted text-muted-foreground"
                          }`}>
                            {done ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-3 w-3" />}
                          </div>
                          <p className={`mt-1 text-[10px] text-center ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {s.label}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Driver</p>
                    <p className="font-medium">{delivery.logisticsProvider?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verification code</p>
                    <p className="font-mono font-medium">{delivery.verificationCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recipient</p>
                    <p className="font-medium">{delivery.recipientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusBadge status={delivery.status} />
                  </div>
                  {delivery.handlingInstruction && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Handling</p>
                      <p className="text-sm">{delivery.handlingInstruction}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Delivery not yet arranged. The pharmacy will assign a driver once the order is accepted.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Pharmacy</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Pharmacy" value={order.pharmacy?.name ?? "—"} />
              <Row label="Address" value={order.pharmacy ? `${order.pharmacy.address}, ${order.pharmacy.city}` : "—"} />
              <Row label="Phone" value={order.pharmacy?.phone ?? "—"} />
              <Row label="Status" value={<StatusBadge status={order.status} />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Payment</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              <Row label="Delivery fee" value={formatCurrency(order.deliveryFee)} />
              <Row label="Commission total" value={`–${formatCurrency(order.commissionTotal)}`} />
              <div className="border-t pt-2">
                <Row label="Total paid" value={<span className="font-bold text-emerald-700">{formatCurrency(order.total)}</span>} />
              </div>
              <Row label="Payment status" value={<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 capitalize">{order.paymentStatus}</Badge>} />
              {order.verificationCode && (
                <Row label="Order code" value={<span className="font-mono">{order.verificationCode}</span>} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery address</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {order.deliveryAddress ? <p>{order.deliveryAddress}</p> : <p className="text-muted-foreground">Pickup at pharmacy</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
