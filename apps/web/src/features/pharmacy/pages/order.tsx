"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Package, Receipt, Truck } from "lucide-react";
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
import { useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Order = PrescriptionComponents["schemas"]["PharmacyOrder"];

export function PharmacyOrderDetail() {
  const { session, view } = useNav();
  const organizationId = session?.profileId;
  const orderId = view.params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      setOrder(await productionPrescriptionService.pharmacy.order(orderId));
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

  async function prepare(method: "PICKUP" | "DELIVERY") {
    if (!organizationId || order === null) return;
    setBusy(true);
    try {
      setOrder(
        await productionPrescriptionService.pharmacy.prepareHandoff(
          organizationId,
          order.id,
          { expectedOrderVersion: order.version, method },
          crypto.randomUUID(),
        ),
      );
      toast.success(`${method === "PICKUP" ? "Pickup" : "Delivery"} handoff prepared`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Handoff could not be prepared");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!organizationId || order?.handoff === null || order === null) return;
    setBusy(true);
    try {
      setOrder(
        await productionPrescriptionService.pharmacy.completeHandoff(
          organizationId,
          order.id,
          order.handoff.version,
          crypto.randomUUID(),
        ),
      );
      toast.success("Handoff recorded");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Handoff could not be completed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading order…" />;
  if (error !== null || order === null)
    return <EmptyState title="Order unavailable" description={error ?? "Order was not found"} />;

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={order.orderNumber}
        description={`Accepted ${formatDate(order.acceptedAt)}`}
        actions={<StatusBadge status={order.status.toLowerCase()} />}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Quote snapshot" icon={Receipt}>
          <dl className="space-y-2 text-sm">
            <Row label="Quote" value={order.quote.quoteNumber} />
            <Row
              label="Total"
              value={formatMinorCurrency(order.quote.totalMinor, order.quote.currency)}
            />
            <Row label="Payment reference" value={order.paymentId} />
          </dl>
        </SectionCard>
        <SectionCard title="Handoff" icon={Truck}>
          {order.handoff === null ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => prepare("PICKUP")}
                disabled={busy || order.status !== "CONFIRMED"}
              >
                Prepare pickup
              </Button>
              <Button
                variant="outline"
                onClick={() => prepare("DELIVERY")}
                disabled={busy || order.status !== "CONFIRMED"}
              >
                Prepare delivery
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <Row label="Method" value={order.handoff.method} />
                <Row label="Reference" value={order.handoff.handoffReference} />
                <Row label="Status" value={order.handoff.status} />
              </dl>
              {order.handoff.status === "READY" && (
                <Button onClick={complete} disabled={busy}>
                  Confirm handoff
                </Button>
              )}
            </div>
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
      <p className="text-xs text-muted-foreground">
        Dispensing is recorded separately from commercial handoff. Preparing or completing handoff
        never changes the clinical dispense record.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right break-all">{value}</dd>
    </div>
  );
}
