"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { appointmentService, encounterService } from "@/lib/services";
import type { Appointment, ClinicalEncounter } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { consultationActionLabel, consultationChannelLabel, isOnlineConsultationChannel } from "@/lib/consultation-policy";

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
  const channel = isOnlineConsultationChannel(appt.consultationChannel) ? appt.consultationChannel : "video";
  const ChannelIcon = channel === "audio" ? Phone : channel === "chat" ? MessageSquare : Video;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Appointment`}
        description={`Booked on ${formatDate(appt.date)} at ${formatTime(appt.time)}`}
        back
        actions={
          <div className="flex flex-wrap gap-2">
            {isUpcoming && (
              <>
                <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)}>
                  <RotateCcw className="h-4 w-4" /> Reschedule
                </Button>
                <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => setCancelling(true)}>
                  <XCircle className="h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" onClick={() => navigate("patient", "consultation", { id: appt.id })}>
                  <ChannelIcon className="h-4 w-4" /> {consultationActionLabel(channel)}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Provider + status */}
          <SectionCard title="Provider" icon={Building2}>
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{provider ? fullName(provider) : "Provider"}</p>
                    <p className="text-sm text-muted-foreground">{provider?.specialty}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{provider?.professionalTitle}</p>
                  </div>
                  <StatusBadge status={appt.status} size="sm" />
                </div>
                <Separator className="my-3" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="h-4 w-4" /> {relativeDay(appt.date)} · {formatDate(appt.date)} · {formatTime(appt.time)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground capitalize">
                    <ChannelIcon className="h-4 w-4" />
                    {consultationChannelLabel(channel)}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Intake form */}
          <SectionCard title="Pre-consultation intake" icon={FileText}>
            <div className="space-y-3">
              <Field label="Reason for consultation" value={(intake.reason as string) || "—"} />
              <Field label="Symptoms" value={(intake.symptoms as string) || "—"} multiline />
              <div className="flex items-center gap-2 text-sm pt-2">
                <Badge variant="outline" className={intake.consent ? "bg-emerald-50 text-emerald-700 border-emerald-200 gap-1" : "gap-1"}>
                  {intake.consent ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Consent {intake.consent ? "granted" : "not granted"}
                </Badge>
              </div>
            </div>
          </SectionCard>

          {/* Encounter / preparation notes */}
          {isCompleted && encounter ? (
            <SectionCard title="Clinical encounter" icon={FileText}>
              <div className="space-y-3">
                <Field label="Encounter" value={`${encounter.encounterNumber} · ${formatDate(encounter.createdAt)}`} />
                <Field label="Chief complaint" value={encounter.documentation?.chiefComplaint} multiline />
                <Field label="Diagnosis" value={encounter.documentation?.diagnosis} multiline />
                <Field label="Treatment plan" value={encounter.documentation?.treatmentPlan} multiline />
                <Field label="Patient instructions" value={encounter.documentation?.patientInstructions} multiline />
                <Field label="Follow-up" value={encounter.documentation?.followUp} multiline />
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("patient", "records")}>
                    View full record <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Preparation notes" icon={CheckCircle2}>
              <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <li>• Test your camera & microphone 10 minutes before the appointment.</li>
                <li>• Find a quiet, well-lit space for the consultation.</li>
                <li>• Have a list of your current medications and any recent test results ready.</li>
                {provider?.specialty?.toLowerCase().includes("cardiolog") && <li>• Take your blood pressure before the consultation if you have a home monitor.</li>}
              </ul>
            </SectionCard>
          )}
        </div>

        {/* Right column: payment + patient */}
        <div className="space-y-6">
          <SectionCard title="Payment" icon={FileText}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Consultation fee</dt>
                <dd className="font-medium">{formatCurrency(appt.price)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Method</dt>
                <dd className="capitalize">{appt.payment?.method ?? "card"}</dd>
              </div>
              <div className="flex justify-between gap-3 items-center">
                <dt className="text-muted-foreground">Status</dt>
                <dd><Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 capitalize">{appt.paymentStatus}</Badge></dd>
              </div>
              {appt.payment?.reference && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="font-mono text-xs">{appt.payment.reference}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          {profile && (
            <SectionCard title="Patient" icon={Building2}>
              <div className="text-sm space-y-1.5">
                <p className="font-medium">{profile.firstName} {profile.lastName}</p>
                <p className="text-muted-foreground font-mono text-xs">{profile.patientNumber}</p>
                <p className="text-muted-foreground">{profile.city}, {profile.state}</p>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Reschedule modal */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              Pick a new date and time slot. The provider will be notified automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">New date</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {days.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setNewDate(d.value)}
                    className={`rounded-lg border p-2 text-center transition-all tap-highlight-none ${
                      newDate === d.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
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
                      className={`rounded-lg border px-2 py-1.5 text-xs transition-all tap-highlight-none ${
                        newTime === t ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/30"
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
            <Button disabled={!newDate || !newTime || busy} onClick={confirmReschedule}>
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

function Field({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm mt-0.5 ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>{value || "—"}</p>
    </div>
  );
}
