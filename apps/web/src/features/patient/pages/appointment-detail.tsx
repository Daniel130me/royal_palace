"use client";

import type { AppointmentResponse, PaymentStatusResponse } from "@royal-palace/contracts";
import { CalendarClock, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMinorCurrency } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { schedulingPaymentService } from "@/lib/services";

const PAYMENT_POLL_INTERVAL_MS = 3_000;
const POLLABLE_PAYMENT_STATUSES = new Set(["CREATED", "PENDING"]);

export function PatientAppointmentDetail() {
  const { view } = useNav();
  const appointmentId = view.params?.id;
  const [appointment, setAppointment] = useState<AppointmentResponse | null>(null);
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appointmentId === undefined) {
      setError("Appointment reference is missing.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    schedulingPaymentService
      .appointment(appointmentId, controller.signal)
      .then((result) => {
        setAppointment(result);
        return schedulingPaymentService.paymentStatus(result.paymentId, controller.signal);
      })
      .then(setPayment)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Appointment status could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  useEffect(() => {
    if (
      appointment === null ||
      payment === null ||
      !POLLABLE_PAYMENT_STATUSES.has(payment.status)
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void schedulingPaymentService
        .paymentStatus(appointment.paymentId)
        .then(setPayment)
        .catch(() => {
          // A transient polling failure must not replace the last verified server state.
        });
    }, PAYMENT_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [appointment, payment]);

  if (loading) return <LoadingState label="Loading verified appointment status…" />;
  if (error !== null || appointment === null || payment === null) {
    return (
      <EmptyState
        title="Appointment unavailable"
        description={error ?? "The appointment could not be found."}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Appointment status" back />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Appointment" icon={CalendarClock}>
          <dl className="grid gap-3 text-sm">
            <Row label="Practitioner" value={appointment.practitioner.displayName} />
            <Row label="Starts" value={formatDateTime(appointment.startsAt)} />
            <Row label="Ends" value={formatDateTime(appointment.endsAt)} />
            <Row label="Mode" value={appointment.mode.toLowerCase().replaceAll("_", " ")} />
            <Row
              label="Amount"
              value={formatMinorCurrency(appointment.amountMinor, appointment.currency)}
            />
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Appointment status</dt>
              <dd>
                <Badge variant="outline">{appointment.status.replaceAll("_", " ")}</Badge>
              </dd>
            </div>
          </dl>
        </SectionCard>
        <SectionCard title="Verified payment" icon={CreditCard}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Status comes from an authenticated provider event or controlled reconciliation, never
              from browser redirect parameters.
            </div>
            <dl className="grid gap-3 text-sm">
              <Row
                label="Amount"
                value={formatMinorCurrency(payment.amountMinor, payment.currency)}
              />
              <Row label="Last updated" value={formatDateTime(payment.updatedAt)} />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Payment status</dt>
                <dd className="flex items-center gap-2">
                  {POLLABLE_PAYMENT_STATUSES.has(payment.status) ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : null}
                  <Badge variant="outline">{payment.status.replaceAll("_", " ")}</Badge>
                </dd>
              </div>
            </dl>
            <Button
              variant="outline"
              onClick={() =>
                void schedulingPaymentService.paymentStatus(payment.id).then(setPayment)
              }
            >
              Refresh verified status
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}
