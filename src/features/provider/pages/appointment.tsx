"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, encounterService, patientService } from "@/lib/services";
import { normalizePatient, WithTimestamps } from "../normalize";
import { intakeReason } from "./dashboard";
import type { Appointment, Patient } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  BottomActionBar,
  LoadingState,
  ErrorState,
} from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, formatTime, relativeDay, fullName, age, initials } from "@/lib/format";
import { toast } from "sonner";
import {
  Video, Phone, MessageSquare, User, Stethoscope, FileText,
  Pill, AlertCircle, Activity, Calendar, Wallet, ShieldCheck, PlayCircle,
  ArrowRight,
} from "lucide-react";

function channelIcon(channel: string) {
  if (channel === "video") return Video;
  if (channel === "audio") return Phone;
  if (channel === "chat") return MessageSquare;
  return User;
}

export function ProviderAppointmentDetail() {
  const { view } = useNav();
  const { providerId } = useProviderContext();
  const id = view.params.id;
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const a = await appointmentService.get(id);
      setAppt(a);
      if (a.patientId) {
        const p = await patientService.get(a.patientId);
        setPatient(normalizePatient(p));
      }
    } catch (e) {
      setError((e as Error).message ?? "Appointment not found.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function startConsultation() {
    if (!appt || !providerId) return;
    setStarting(true);
    try {
      const enc = await encounterService.start(appt.id, providerId);
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: enc.id });
    } catch (e) {
      toast.error("Could not start consultation: " + (e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <LoadingState label="Loading appointment…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!appt) return <ErrorState message="Appointment not found." />;

  const Icon = channelIcon(appt.consultationChannel);
  const intake = appt.intakeForm as unknown;
  const intakeObj: Record<string, unknown> =
    intake && typeof intake === "object"
      ? (intake as Record<string, unknown>)
      : typeof intake === "string"
        ? (() => { try { return JSON.parse(intake) as Record<string, unknown>; } catch { return {}; } })()
        : {};
  const symptoms = typeof intakeObj.symptoms === "string" ? intakeObj.symptoms : "";
  const consent = typeof intakeObj.consent === "boolean" ? intakeObj.consent : appt.consentStatus === "granted";

  const canStart = ["scheduled", "checked_in", "waiting_for_provider"].includes(appt.status);
  const inProgress = appt.status === "in_progress" && appt.encounter;

  const cta = (
    <>
      {canStart && (
        <Button className="flex-1 sm:flex-none" disabled={starting} onClick={startConsultation}>
          <PlayCircle className="h-4 w-4 mr-1" />
          {starting ? "Starting…" : "Start Consultation"}
        </Button>
      )}
      {inProgress && (
        <Button className="flex-1 sm:flex-none" onClick={() => navigate("provider", "encounter", { id: appt.encounter!.id })}>
          Continue documentation
        </Button>
      )}
      {appt.status === "completed" && appt.encounter && (
        <Button onClick={() => navigate("provider", "encounter", { id: appt.encounter!.id })}>
          <FileText className="h-4 w-4 mr-1" /> View clinical record
        </Button>
      )}
    </>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={patient ? fullName(patient) : "Appointment"}
        description={`${appt.id} · ${relativeDay(appt.date)} at ${formatTime(appt.time)}`}
        breadcrumbs={[
          { label: "Appointments", onClick: () => navigate("provider", "appointments") },
          { label: appt.id },
        ]}
        back
      />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Consultation details */}
          <SectionCard
            title="Consultation"
            icon={Stethoscope}
            action={
              <div className="flex items-center gap-2">
                <StatusBadge status={appt.status} size="sm" />
                <StatusBadge status={appt.paymentStatus} size="sm" />
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Date & time</p>
                <p className="text-sm font-semibold mt-1">{formatDate(appt.date)} · {formatTime(appt.time)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{appt.durationMinutes} minutes · {relativeDay(appt.date)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Channel</p>
                <p className="text-sm font-semibold mt-1 capitalize flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-primary" /> {appt.consultationChannel.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Consultation fee</p>
                <p className="text-sm font-semibold mt-1">{formatCurrency(appt.price)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Patient-facing · read only</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reference</p>
                <p className="text-sm font-mono mt-1 break-all">{appt.id}</p>
              </div>
            </div>

            {/* Desktop CTA */}
            <div className="hidden sm:flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/60">
              {cta}
              {patient && (
                <Button variant="outline" onClick={() => navigate("provider", "patient", { id: patient.id })}>
                  View patient record <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          </SectionCard>

          {/* Intake form */}
          <SectionCard title="Patient intake form" icon={FileText}>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reason for visit</p>
                <p className="text-sm mt-1 leading-relaxed">{intakeReason(appt)}</p>
              </div>
              {symptoms && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reported symptoms</p>
                  <p className="text-sm mt-1 leading-relaxed">{symptoms}</p>
                </div>
              )}
              <Separator />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Consent</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {consent ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Consent granted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Consent pending</Badge>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">{appt.consentStatus.replace(/_/g, " ")}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Patient summary preview */}
          {patient && (
            <SectionCard
              title="Patient summary"
              icon={User}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("provider", "patient", { id: patient.id })}>
                  Open full record <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {patient.firstName[0]}{patient.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{fullName(patient)}</p>
                    <p className="text-xs text-muted-foreground truncate">{patient.patientNumber} · {age(patient.dateOfBirth) ?? "—"}y · {patient.gender}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Blood group</p>
                    <p className="text-sm font-medium mt-0.5">{patient.bloodGroup ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Genotype</p>
                    <p className="text-sm font-medium mt-0.5">{patient.genotype ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Phone</p>
                    <p className="text-sm font-medium mt-0.5 truncate">{patient.phone}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 pt-3 border-t border-border/60">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wider">
                      <AlertCircle className="h-3 w-3 text-rose-500" /> Allergies
                    </p>
                    {patient.allergies.filter((a) => a.status === "active").length === 0 ? (
                      <p className="text-sm text-muted-foreground">None recorded</p>
                    ) : (
                      <div className="space-y-0.5">
                        {patient.allergies.filter((a) => a.status === "active").map((al, i) => (
                          <div key={i} className="text-sm font-medium text-rose-700">
                            {al.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wider">
                      <Activity className="h-3 w-3 text-amber-500" /> Active conditions
                    </p>
                    {patient.conditions.filter((c) => c.status === "active").length === 0 ? (
                      <p className="text-sm text-muted-foreground">None recorded</p>
                    ) : (
                      <div className="space-y-0.5">
                        {patient.conditions.filter((c) => c.status === "active").map((c, i) => (
                          <div key={i} className="text-sm">{c.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wider">
                      <Pill className="h-3 w-3 text-sky-500" /> Medications
                    </p>
                    {patient.medications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None</p>
                    ) : (
                      <div className="space-y-0.5">
                        {patient.medications.slice(0, 4).map((m, i) => (
                          <div key={i} className="text-sm">{m.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <SectionCard title="Appointment details" icon={Calendar}>
            <div className="text-sm space-y-2.5">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Reference</span><span className="font-mono text-xs break-all text-right">{appt.id}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Booked on</span><span className="font-medium text-right">{formatDate((appt as WithTimestamps<Appointment>).createdAt)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Duration</span><span className="font-medium">{appt.durationMinutes} min</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Channel</span><span className="font-medium capitalize">{appt.consultationChannel.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Service ID</span><span className="font-mono text-xs text-right break-all">{appt.serviceId ?? "—"}</span></div>
            </div>
          </SectionCard>

          <SectionCard title="Payment" icon={Wallet}>
            <div className="text-sm space-y-2.5">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Patient price</span><span className="font-semibold">{formatCurrency(appt.price)}</span></div>
              <div className="flex justify-between items-center gap-2"><span className="text-muted-foreground">Payment status</span><StatusBadge status={appt.paymentStatus} size="sm" /></div>
              <p className="text-xs text-muted-foreground pt-2 border-t border-border/60 leading-relaxed">
                Consultation pricing is set by the platform. Doctors cannot edit patient-facing fees.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <BottomActionBar>
        <div className="flex items-center gap-2">
          {cta}
          {patient && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate("provider", "patient", { id: patient.id })}>
              <User className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </BottomActionBar>
    </div>
  );
}
