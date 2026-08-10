"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, encounterService, patientService } from "@/lib/services";
import { normalizePatient, WithTimestamps } from "../normalize";
import { intakeReason } from "./dashboard";
import type { Appointment, Patient } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, formatTime, relativeDay, fullName, age } from "@/lib/format";
import { toast } from "sonner";
import {
  ArrowLeft, Video, Phone, MessageSquare, User, Stethoscope, FileText,
  Pill, AlertCircle, Activity, Calendar, Wallet, ShieldCheck, PlayCircle,
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

  return (
    <div>
      <PageHeader
        title={patient ? fullName(patient) : "Appointment"}
        description={`${appt.id} · ${relativeDay(appt.date)} at ${formatTime(appt.time)}`}
        breadcrumbs={[
          { label: "Appointments", onClick: () => navigate("provider", "appointments") },
          { label: appt.id },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("provider", "appointments")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Appointment card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Consultation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Date & time</p>
                  <p className="text-sm font-medium">{formatDate(appt.date)} · {formatTime(appt.time)}</p>
                  <p className="text-xs text-muted-foreground">{appt.durationMinutes} minutes · {relativeDay(appt.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Channel</p>
                  <p className="text-sm font-medium capitalize flex items-center gap-1.5">
                    <Icon className="h-4 w-4" /> {appt.consultationChannel.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={appt.status} />
                    <StatusBadge status={appt.paymentStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Consultation fee</p>
                  <p className="text-sm font-medium">{formatCurrency(appt.price)}</p>
                  <p className="text-xs text-muted-foreground">Patient-facing price · read only</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {canStart && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={starting} onClick={startConsultation}>
                    <PlayCircle className="h-4 w-4 mr-1" />
                    {starting ? "Starting…" : "Start Consultation"}
                  </Button>
                )}
                {inProgress && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("provider", "encounter", { id: appt.encounter!.id })}>
                    Continue documentation
                  </Button>
                )}
                {appt.status === "completed" && appt.encounter && (
                  <Button onClick={() => navigate("provider", "encounter", { id: appt.encounter!.id })}>
                    <FileText className="h-4 w-4 mr-1" /> View clinical record
                  </Button>
                )}
                {patient && (
                  <Button variant="outline" onClick={() => navigate("provider", "patient", { id: patient.id })}>
                    View patient record
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Intake form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Patient intake form
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Reason for visit</p>
                <p className="text-sm">{intakeReason(appt)}</p>
              </div>
              {symptoms && (
                <div>
                  <p className="text-xs text-muted-foreground">Reported symptoms</p>
                  <p className="text-sm">{symptoms}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Consent</p>
                <div className="flex items-center gap-2 mt-1">
                  {consent ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Consent granted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Consent pending</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{appt.consentStatus}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patient summary preview */}
          {patient && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Patient summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient number</p>
                    <p className="text-sm font-medium">{patient.patientNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age / gender</p>
                    <p className="text-sm font-medium">{age(patient.dateOfBirth) ?? "—"} · {patient.gender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Blood group</p>
                    <p className="text-sm font-medium">{patient.bloodGroup ?? "—"}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-rose-500" /> Allergies
                    </p>
                    {patient.allergies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None recorded</p>
                    ) : (
                      patient.allergies.map((al, i) => (
                        <div key={i} className="text-sm">
                          {al.name}
                          <span className="text-xs text-muted-foreground ml-1">({al.source.replace("_", " ")})</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Activity className="h-3 w-3 text-amber-500" /> Active conditions
                    </p>
                    {patient.conditions.filter((c) => c.status === "active").length === 0 ? (
                      <p className="text-sm text-muted-foreground">None recorded</p>
                    ) : (
                      patient.conditions.filter((c) => c.status === "active").map((c, i) => (
                        <div key={i} className="text-sm">{c.name}</div>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Pill className="h-3 w-3 text-sky-500" /> Current medications
                    </p>
                    {patient.medications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None</p>
                    ) : (
                      patient.medications.map((m, i) => (
                        <div key={i} className="text-sm">{m.name}</div>
                      ))
                    )}
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={() => navigate("provider", "patient", { id: patient.id })}>
                  Open full patient record
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Appointment details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono text-xs">{appt.id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Booked on</span><span>{formatDate((appt as WithTimestamps<Appointment>).createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{appt.durationMinutes} min</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Channel</span><span className="capitalize">{appt.consultationChannel.replace("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Service ID</span><span className="font-mono text-xs">{appt.serviceId ?? "—"}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Payment</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Patient price</span><span className="font-medium">{formatCurrency(appt.price)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payment status</span><StatusBadge status={appt.paymentStatus} /></div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Consultation pricing is set by the platform. Doctors cannot edit patient-facing fees.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
