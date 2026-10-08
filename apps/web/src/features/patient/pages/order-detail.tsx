"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { CreditCard, Package, Receipt, Truck } from "lucide-react";
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
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService, schedulingPaymentService } from "@/lib/services";

type Order = PrescriptionComponents["schemas"]["PharmacyOrder"];

export function PatientOrderDetail() {
  const orderId = useNav().view.params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      setOrder(await productionPrescriptionService.patient.order(orderId));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Order could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function beginCheckout() {
    if (order === null) return;
    setBusy(true);
    try {
      const checkout = await schedulingPaymentService.createCheckout(
        order.paymentId,
        crypto.randomUUID(),
      );
      window.location.assign(checkout.checkoutUrl);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Checkout could not be created");
      setBusy(false);
    }
  }

  async function cancel() {
    if (order === null) return;
    setBusy(true);
    try {
      setOrder(
        await productionPrescriptionService.patient.cancelOrder(
          order.id,
          order.version,
          "PATIENT_REQUESTED",
          crypto.randomUUID(),
        ),
      );
      toast.success("Cancellation requested");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Order could not be cancelled");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading order…" />;
  if (error !== null || order === null) {
    return (
      <EmptyState
        title="Order unavailable"
        description={error ?? "Order was not found"}
        action={<Button onClick={() => navigate("patient", "orders")}>Back</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={order.orderNumber}
        description={`Created ${formatDate(order.createdAt)}`}
        actions={<StatusBadge status={order.status.toLowerCase()} />}
      />
      {order.status === "PENDING_PAYMENT" && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Button onClick={beginCheckout} disabled={busy}>
            <CreditCard className="h-4 w-4" /> Continue to secure checkout
          </Button>
          <Button variant="outline" onClick={cancel} disabled={busy}>
            Cancel order
          </Button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Quote snapshot" icon={Receipt}>
          <dl className="space-y-2 text-sm">
            <Row label="Quote" value={order.quote.quoteNumber} />
            <Row
              label="Subtotal"
              value={formatMinorCurrency(order.quote.subtotalMinor, order.quote.currency)}
            />
            <Row
              label="Tax"
              value={formatMinorCurrency(order.quote.taxMinor, order.quote.currency)}
            />
            <Row
              label="Fees"
              value={formatMinorCurrency(order.quote.feeMinor, order.quote.currency)}
            />
            <Row
              label="Total"
              value={formatMinorCurrency(order.quote.totalMinor, order.quote.currency)}
            />
          </dl>
        </SectionCard>
        <SectionCard title="Handoff" icon={Truck}>
          {order.handoff === null ? (
            <p className="text-sm text-muted-foreground">
              The pharmacy has not prepared pickup or delivery handoff.
            </p>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row label="Method" value={order.handoff.method} />
              <Row label="Reference" value={order.handoff.handoffReference} />
              <Row label="Status" value={order.handoff.status} />
            </dl>
          )}
        </SectionCard>
      </div>
      <SectionCard title={`Items (${order.quote.lines.length})`} icon={Package} dense>
        <ul className="divide-y">
          {order.quote.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 p-4 text-sm">
              <div>
                <p className="font-medium">
                  {line.medicationName} {line.strength ?? ""}
                </p>
                <p className="text-muted-foreground">
                  {line.quantity} {line.quantityUnit}
                </p>
              </div>
              <p className="font-medium">
                {formatMinorCurrency(line.lineSubtotalMinor, order.quote.currency)}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
