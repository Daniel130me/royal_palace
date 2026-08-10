"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { pharmacyOrderService } from "@/lib/services";
import type { PharmacyOrder } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Package, ChevronRight, MapPin, Truck, CheckCircle2, Building2, Receipt,
  CircleDot,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";

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
    let cancelled = false;
    setLoading(true);
    pharmacyOrderService.get(id)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Order not found"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(createdAt(order) ?? order.orderNumber)}`}
        back
        actions={<StatusBadge status={order.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <SectionCard title={`Items (${order.items?.length ?? 0})`} icon={Package} dense>
            {(order.items ?? []).length === 0 ? (
              <div className="p-5"><p className="text-sm text-muted-foreground">No items on this order.</p></div>
            ) : (
              <ul className="divide-y divide-border/60">
                {order.items!.map((it) => (
                  <li key={it.id} className="px-4 sm:px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{it.productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Qty {it.quantity} · {formatCurrency(it.unitPrice)} each</p>
                      </div>
                      <p className="font-semibold text-sm shrink-0">{formatCurrency(it.gross)}</p>
                    </div>
                    {/* Item-level commission breakdown — card on mobile */}
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className="rounded-md bg-muted/40 px-2 py-1.5">
                        <p className="text-muted-foreground">Gross</p>
                        <p className="text-foreground font-medium mt-0.5">{formatCurrency(it.gross)}</p>
                      </div>
                      <div className="rounded-md bg-rose-50 px-2 py-1.5">
                        <p className="text-rose-700">Commission ({it.commissionPct}%)</p>
                        <p className="text-rose-700 font-medium mt-0.5">–{formatCurrency(it.commissionAmount)}</p>
                      </div>
                      <div className="rounded-md bg-emerald-50 px-2 py-1.5">
                        <p className="text-emerald-700">Pharmacy net</p>
                        <p className="text-emerald-700 font-medium mt-0.5">{formatCurrency(it.pharmacyNet)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Delivery tracking — vertical timeline */}
          {delivery ? (
            <SectionCard title="Delivery tracking" icon={Truck}>
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-medium">{delivery.pickupLocation}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-medium">{delivery.deliveryLocation}</p>
                </div>
              </div>

              {/* Vertical timeline */}
              <ol className="relative space-y-4 pl-7">
                <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-border" aria-hidden />
                {DELIVERY_STEPS.map((s, i) => {
                  const done = i <= currentStep;
                  return (
                    <li key={s.key} className="relative">
                      <span className={`absolute -left-7 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card ${
                        done ? "border-primary text-primary" : "border-border text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-3 w-3" />}
                      </span>
                      <div className={done ? "" : "opacity-60"}>
                        <p className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{s.label}</p>
                        {i === currentStep && (
                          <p className="text-xs text-primary mt-0.5">Current status</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-3 text-sm">
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
                  <StatusBadge status={delivery.status} size="sm" />
                </div>
                {delivery.handlingInstruction && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Handling</p>
                    <p className="text-sm">{delivery.handlingInstruction}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Delivery" icon={MapPin}>
              <p className="text-sm text-muted-foreground">
                Delivery not yet arranged. The pharmacy will assign a driver once the order is accepted.
              </p>
            </SectionCard>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Pharmacy" icon={Building2}>
            <dl className="text-sm space-y-2.5">
              <Row label="Pharmacy" value={order.pharmacy?.name ?? "—"} />
              <Row label="Address" value={order.pharmacy ? `${order.pharmacy.address}, ${order.pharmacy.city}` : "—"} />
              <Row label="Phone" value={order.pharmacy?.phone ?? "—"} />
              <Row label="Status" value={<StatusBadge status={order.status} size="sm" />} />
            </dl>
          </SectionCard>

          <SectionCard title="Payment" icon={Receipt}>
            <dl className="text-sm space-y-2.5">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              <Row label="Delivery fee" value={formatCurrency(order.deliveryFee)} />
              <Row label="Commission total" value={`–${formatCurrency(order.commissionTotal)}`} />
              <Separator className="my-1" />
              <Row label="Total paid" value={<span className="font-bold text-base text-primary">{formatCurrency(order.total)}</span>} />
              <Row label="Payment status" value={<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 capitalize">{order.paymentStatus}</Badge>} />
              {order.verificationCode && (
                <Row label="Order code" value={<span className="font-mono">{order.verificationCode}</span>} />
              )}
            </dl>
          </SectionCard>

          <SectionCard title="Delivery address" icon={MapPin}>
            <p className="text-sm">{order.deliveryAddress ?? <span className="text-muted-foreground">Pickup at pharmacy</span>}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
