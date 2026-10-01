"use client";

import type {
  AppointmentResponse,
  HostedCheckoutResponse,
  PractitionerAvailabilityResponse,
  PublicPractitionerDetail,
} from "@royal-palace/contracts";
import { CalendarClock, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { publicDiscoveryService, schedulingPaymentService } from "@/lib/services";

const AVAILABILITY_HORIZON_DAYS = 30;

export function PatientBook() {
  const { view } = useNav();
  const practitionerId = view.params?.providerId;
  const [practitioner, setPractitioner] = useState<PublicPractitionerDetail | null>(null);
  const [slots, setSlots] = useState<readonly PractitionerAvailabilityResponse[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentResponse | null>(null);
  const [checkout, setCheckout] = useState<HostedCheckoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + AVAILABILITY_HORIZON_DAYS);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  useEffect(() => {
    if (practitionerId === undefined) {
      setError("Select a practitioner before booking.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    Promise.all([
      publicDiscoveryService.practitioner(practitionerId, controller.signal),
      schedulingPaymentService.availability(
        practitionerId,
        range.from,
        range.to,
        controller.signal,
      ),
    ])
      .then(([detail, availability]) => {
        setPractitioner(detail);
        setSlots(availability);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Booking availability could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [practitionerId, range]);

  async function reserveAndContinue(): Promise<void> {
    if (selectedSlotId === null) return;
    setSubmitting(true);
    try {
      const reserved = await schedulingPaymentService.book(selectedSlotId, crypto.randomUUID());
      setAppointment(reserved);
      try {
        const hosted = await schedulingPaymentService.createCheckout(
          reserved.paymentId,
          crypto.randomUUID(),
        );
        setCheckout(hosted);
        toast.success("Appointment reserved. Continue to secure checkout.");
      } catch {
        toast.info("Appointment reserved. Hosted payment is not enabled in this environment yet.");
      }
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "The appointment could not be reserved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading verified availability…" />;
  if (error !== null) return <EmptyState title="Booking unavailable" description={error} />;
  if (practitioner === null) {
    return (
      <EmptyState title="Practitioner unavailable" description="Choose another practitioner." />
    );
  }

  if (appointment !== null) {
    return (
      <div className="space-y-5">
        <PageHeader title="Appointment reserved" back />
        <SectionCard>
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarClock className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Awaiting verified payment</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your slot with {appointment.practitioner.displayName} is reserved until the payment
                window expires. A browser redirect never confirms payment; this page relies on the
                server&apos;s verified provider status.
              </p>
            </div>
            <dl className="mx-auto grid max-w-md gap-2 rounded-xl border p-4 text-left text-sm">
              <Summary label="Time" value={formatDateTime(appointment.startsAt)} />
              <Summary label="Mode" value={modeLabel(appointment.mode)} />
              <Summary
                label="Amount"
                value={formatMinorCurrency(appointment.amountMinor, appointment.currency)}
              />
              <Summary label="Status" value={appointment.status.replaceAll("_", " ")} />
            </dl>
            <div className="flex flex-wrap justify-center gap-2">
              {checkout === null ? null : (
                <Button onClick={() => window.location.assign(checkout.checkoutUrl)}>
                  <CreditCard className="h-4 w-4" /> Continue to hosted checkout
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => navigate("patient", "appointment", { id: appointment.id })}
              >
                View appointment status
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={`Book ${practitioner.displayName}`}
        description="Choose an administrator-priced, practitioner-published slot."
      />
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{practitioner.displayName}</h2>
            <p className="text-sm text-muted-foreground">
              {practitioner.specialties.map(({ name }) => name).join(" · ") ||
                practitioner.professions.map(({ name }) => name).join(" · ")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Independently verified
          </Badge>
        </div>
      </SectionCard>
      <SectionCard title="Available appointments" icon={CalendarClock}>
        {slots.length === 0 ? (
          <EmptyState
            title="No open appointments"
            description="This practitioner has no bookable slots in the next 30 days."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {slots.map((slot) => {
              const selected = selectedSlotId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                  onClick={() => setSelectedSlotId(slot.id)}
                >
                  <p className="font-medium">{formatDateTime(slot.startsAt)}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {modeLabel(slot.mode)}
                  </p>
                  <p className="mt-3 font-semibold text-primary">
                    {formatMinorCurrency(slot.amountMinor, slot.currency)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>
      <div className="flex justify-end">
        <Button
          disabled={selectedSlotId === null || submitting}
          onClick={() => void reserveAndContinue()}
        >
          {submitting ? "Reserving…" : "Reserve and continue"}
        </Button>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}

function modeLabel(mode: PractitionerAvailabilityResponse["mode"]): string {
  return mode.toLowerCase().replaceAll("_", " ");
}
