"use client";

import type { ProviderAppointmentResponse } from "@royal-palace/contracts";
import {
  Calendar,
  FileText,
  MessageSquare,
  Phone,
  PlayCircle,
  Stethoscope,
  User,
  Video,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  BottomActionBar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMinorCurrency, initials } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { encounterService, schedulingPaymentService } from "@/lib/services";

export function ProviderAppointmentDetail() {
  const { view } = useNav();
  const appointmentId = view.params.id;
  const [appointment, setAppointment] = useState<ProviderAppointmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (appointmentId === undefined) {
      setError("Appointment reference is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setAppointment(await schedulingPaymentService.providerAppointment(appointmentId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Appointment could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startConsultation() {
    if (appointment === null) return;
    setStarting(true);
    try {
      const encounter = await encounterService.start(appointment.id, "");
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: encounter.id });
    } catch (reason) {
      toast.error(
        `Could not start consultation: ${reason instanceof Error ? reason.message : "Unknown error"}`,
      );
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <LoadingState label="Loading appointment…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (appointment === null) return <ErrorState message="Appointment not found." />;

  const ChannelIcon =
    appointment.mode === "VIDEO"
      ? Video
      : appointment.mode === "AUDIO"
        ? Phone
        : appointment.mode === "CHAT"
          ? MessageSquare
          : User;
  const durationMinutes = Math.round(
    (Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000,
  );
  const canStart = appointment.status === "CONFIRMED";
  const patientAction = () => navigate("provider", "patient", { id: appointment.patient.id });

  const actions = (
    <>
      {canStart && (
        <Button disabled={starting} onClick={() => void startConsultation()}>
          <PlayCircle className="h-4 w-4" /> {starting ? "Starting…" : "Start consultation"}
        </Button>
      )}
      <Button variant="outline" onClick={patientAction}>
        <FileText className="h-4 w-4" /> View governed patient record
      </Button>
    </>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={appointment.patient.displayName}
        description={`${appointment.id} · ${formatDateTime(appointment.startsAt)}`}
        breadcrumbs={[
          { label: "Appointments", onClick: () => navigate("provider", "appointments") },
          { label: appointment.id },
        ]}
        back
      />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard
            title="Consultation"
            icon={Stethoscope}
            action={<StatusBadge status={appointment.status.toLowerCase()} size="sm" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Starts" value={formatDateTime(appointment.startsAt)} />
              <Detail label="Ends" value={formatDateTime(appointment.endsAt)} />
              <Detail
                label="Channel"
                value={appointment.mode.replaceAll("_", " ").toLowerCase()}
                icon={<ChannelIcon className="h-4 w-4 text-primary" />}
              />
              <Detail label="Duration" value={`${durationMinutes} minutes`} />
            </div>
            <div className="mt-4 hidden flex-wrap gap-2 border-t border-border/60 pt-4 sm:flex">
              {actions}
            </div>
          </SectionCard>

          <SectionCard title="Patient" icon={User}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                    {initials(appointment.patient.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {appointment.patient.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Patient reference: {appointment.patient.id}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={patientAction}>
                Open record
              </Button>
            </div>
            <p className="mt-4 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
              Clinical history, intake information, allergies, conditions, and medications are
              disclosed only through the governed patient-record boundary.
            </p>
          </SectionCard>

          <SectionCard title="Patient intake" icon={FileText}>
            {appointment.intake === undefined ? (
              <p className="text-sm text-muted-foreground">
                No governed intake record is attached to this appointment.
              </p>
            ) : appointment.intake.consentStatus === "REVOKED" ? (
              <div className="space-y-2">
                <StatusBadge status="revoked" size="sm" />
                <p className="text-sm text-muted-foreground">
                  The patient withdrew consent. The intake content is no longer disclosed.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Detail label="Reason for consultation" value={appointment.intake.reason ?? "—"} />
                <Detail
                  label="Reported symptoms or context"
                  value={appointment.intake.symptoms ?? "No additional symptoms reported"}
                />
                <div className="border-t border-border/60 pt-3">
                  <StatusBadge status="granted" size="sm" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Consent is limited to this consultation and may be withdrawn by the patient.
                  </p>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Appointment details" icon={Calendar}>
            <dl className="space-y-2.5 text-sm">
              <SummaryRow label="Reference" value={appointment.id} mono />
              <SummaryRow label="Payment reference" value={appointment.paymentId} mono />
              <SummaryRow label="Version" value={String(appointment.version)} />
            </dl>
          </SectionCard>
          <SectionCard title="Fee" icon={Wallet}>
            <p className="text-lg font-semibold">
              {formatMinorCurrency(appointment.amountMinor, appointment.currency)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Patient-facing consultation pricing is controlled by the platform and is read only for
              practitioners.
            </p>
          </SectionCard>
        </div>
      </div>

      <BottomActionBar>
        <div className="flex items-center gap-2">{actions}</div>
      </BottomActionBar>
    </div>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "break-all text-right font-mono text-xs" : "font-medium"}>{value}</dd>
    </div>
  );
}
