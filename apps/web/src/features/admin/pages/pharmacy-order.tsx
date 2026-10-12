"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatMinorCurrency } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type AdminOrder = PrescriptionComponents["schemas"]["AdminPharmacyOrder"];
const REASON_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/;

export function AdminPharmacyOrderDetail() {
  const orderId = useNav().view.params.id ?? "";
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing order id");
      setLoading(false);
      return;
    }
    let active = true;
    void productionPrescriptionService.admin
      .order(orderId)
      .then((value) => active && setOrder(value))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Order could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [orderId]);

  async function openDispute() {
    if (order === null || !REASON_CODE.test(reasonCode.trim())) return;
    setSubmitting(true);
    try {
      await productionPrescriptionService.admin.requestDispute(
        order.id,
        order.version,
        reasonCode.trim().toUpperCase(),
        crypto.randomUUID(),
      );
      setOrder(await productionPrescriptionService.admin.order(order.id));
      setReasonCode("");
      toast.success("Dispute opened");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The dispute could not be opened");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading pharmacy order" />;
  if (error !== null || order === null) {
    return <ErrorState message={error ?? "Order was not found"} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.orderNumber}
        description="Administrator oversight excludes patient identity, prescription content and medication details."
        actions={<StatusBadge status={order.status.toLowerCase()} />}
      />
      <SectionCard title="Order summary">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Summary label="Pharmacy" value={order.pharmacy.displayName} />
          <Summary label="Total" value={formatMinorCurrency(order.totalMinor, order.currency)} />
          <Summary label="Quote type" value={order.quoteKind.replaceAll("_", " ")} />
          <Summary label="Items" value={String(order.itemCount)} />
          <Summary label="Created" value={formatDateTime(order.createdAt)} />
          <Summary label="Handoff" value={order.handoff?.status ?? "Not prepared"} />
        </dl>
      </SectionCard>
      <SectionCard title="Exception handling">
        <div className="flex max-w-xl gap-2">
          <Input
            aria-label="Dispute reason code"
            maxLength={100}
            onChange={(event) => setReasonCode(event.target.value)}
            placeholder="Reason code, for example PAYMENT_MISMATCH"
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,99}"
            value={reasonCode}
          />
          <Button
            disabled={submitting || !REASON_CODE.test(reasonCode.trim())}
            onClick={() => void openDispute()}
            type="button"
          >
            Open dispute
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
