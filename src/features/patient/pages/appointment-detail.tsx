"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { appointmentService, encounterService } from "@/lib/services";
import type { Appointment, ClinicalEncounter } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Video, CalendarClock, Phone, MessageSquare, Building2, FileText, CheckCircle2, XCircle, RotateCcw, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatTime, fullName, initials, relativeDay } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

function nextDays(count: number): { value: string; label: string; sub: string }[] {
  const out: { value: string; label: string; sub: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const sub = i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" });
    out.push({ value, label, sub });
  }
  return out;
}

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

export function PatientAppointmentDetail() {
  const { view } = useNav();
  const { profile } = usePatientContext();
  const id = view.params?.id;
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [encounter, setEncounter] = useState<ClinicalEncounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const a = await appointmentService.get(id);
      setAppt(a);
      if (a.encounter?.id) {
        setEncounter(await encounterService.get(a.encounter.id));
      } else {
        try { setEncounter(await encounterService.byAppointment(a.id)); } catch { /* no encounter yet */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Appointment not found");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function confirmReschedule() {
    if (!appt || !newDate || !newTime) return;
    setBusy(true);
    try {
      const updated = await appointmentService.update(appt.id, { date: newDate, time: newTime, status: "scheduled" });
      setAppt(updated);
      setRescheduleOpen(false);
      setNewDate("");
      setNewTime("");
      toast.success(`Appointment rescheduled to ${formatDate(newDate)} at ${formatTime(newTime)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reschedule");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!appt) return;
    setBusy(true);
    try {
      const updated = await appointmentService.update(appt.id, { status: "cancelled" });
      setAppt(updated);
      setCancelling(false);
      toast.success("Appointment cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading appointment…" />;
  if (error || !appt) return <EmptyState title="Appointment not found" description={error ?? ""} action={<Button onClick={() => navigate("patient", "appointments")}>Back to appointments</Button>} />;

  const provider = appt.provider;
  const intake = appt.intakeForm ?? {};
  const isUpcoming = ["scheduled", "checked_in", "waiting_for_provider", "in_progress", "awaiting_documentation"].includes(appt.status);
  const isCompleted = appt.status === "completed";
  const days = nextDays(14);
  const channelIcon = appt.consultationChannel === "video" ? Video : appt.consultationChannel === "audio" ? Phone : appt.consultationChannel === "chat" ? MessageSquare : Building2;

  return (
    <div>
      <PageHeader
        title={`Appointment ${appt.id}`}
        description={`Booked on ${formatDate(appt.date)} at ${formatTime(appt.time)}`}
        breadcrumbs={[
          { label: "Appointments", onClick: () => navigate("patient", "appointments") },
          { label: appt.id },
        ]}
        actions={
          <div className="flex gap-2">
            {isUpcoming && (
              <>
                <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reschedule
                </Button>
                <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => setCancelling(true)}>
                  <XCircle className="h-4 w-4 mr-1" /> Cancel
                </Button>
                {appt.consultationChannel === "video" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "consultation", { id: appt.id })}>
                    <Video className="h-4 w-4 mr-1" /> Join consultation
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Provider + status */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                    {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{provider ? fullName(provider) : "Provider"}</p>
                      <p className="text-sm text-muted-foreground">{provider?.specialty}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{provider?.professionalTitle}</p>
                    </div>
                    <StatusBadge status={appt.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <CalendarClock className="h-4 w-4" /> {relativeDay(appt.date)} · {formatDate(appt.date)} · {formatTime(appt.time)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground capitalize">
                      {(() => { const Icon = channelIcon; return <Icon className="h-4 w-4" />; })()}
                      {" "}{appt.consultationChannel.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Intake form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Pre-consultation intake
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Reason for consultation</p>
                <p className="text-sm">{(intake.reason as string) || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Symptoms</p>
                <p className="text-sm whitespace-pre-wrap">{(intake.symptoms as string) || "—"}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className={intake.consent ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}>
                  {intake.consent ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  Consent {intake.consent ? "granted" : "not granted"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Encounter / preparation notes */}
          {isCompleted && encounter ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Clinical encounter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Encounter" value={`${encounter.encounterNumber} · ${formatDate(encounter.createdAt)}`} />
                <Field label="Chief complaint" value={encounter.documentation?.chiefComplaint} />
                <Field label="Diagnosis" value={encounter.documentation?.diagnosis} />
                <Field label="Treatment plan" value={encounter.documentation?.treatmentPlan} />
                <Field label="Patient instructions" value={encounter.documentation?.patientInstructions} />
                <Field label="Follow-up" value={encounter.documentation?.followUp} />
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("patient", "records")}>
                    View full record <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preparation notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• Test your camera & microphone 10 minutes before the appointment.</p>
                <p>• Find a quiet, well-lit space for the consultation.</p>
                <p>• Have a list of your current medications and any recent test results ready.</p>
                {provider?.specialty?.toLowerCase().includes("cardiolog") && <p>• Take your blood pressure before the consultation if you have a home monitor.</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: payment */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consultation fee</span>
                <span className="font-medium">{formatCurrency(appt.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="capitalize">{appt.payment?.method ?? "card"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 capitalize">{appt.paymentStatus}</Badge>
              </div>
              {appt.payment?.reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{appt.payment.reference}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {profile && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Patient</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{profile.firstName} {profile.lastName}</p>
                <p className="text-muted-foreground">{profile.patientNumber}</p>
                <p className="text-muted-foreground">{profile.city}, {profile.state}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Reschedule modal */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              Pick a new date and time slot. The provider will be notified automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">New date</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {days.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setNewDate(d.value)}
                    className={`rounded-lg border p-2 text-center transition-all ${
                      newDate === d.value ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
                    }`}
                  >
                    <p className="text-[9px] text-muted-foreground uppercase">{d.sub}</p>
                    <p className="text-xs font-semibold mt-0.5">{d.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {newDate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">New time</p>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_SLOTS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewTime(t)}
                      className={`rounded-lg border px-2 py-1.5 text-xs transition-all ${
                        newTime === t ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium" : "border-border hover:border-emerald-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!newDate || !newTime || busy} onClick={confirmReschedule}>
              {busy ? "Saving…" : "Confirm reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The doctor will be notified and the slot will be released. Refunds (if applicable) are processed within 48 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {busy ? "Cancelling…" : "Yes, cancel appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}
