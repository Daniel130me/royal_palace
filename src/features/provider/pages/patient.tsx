"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import {
  patientService,
  appointmentService,
  prescriptionService,
  labRequestService,
  referralService,
  encounterService,
} from "@/lib/services";
import { resource } from "@/lib/api-client";
import {
  normalizePatient,
  normalizeEncounter,
  normalizeLabRequest,
  normalizeReferral,
  WithTimestamps,
} from "../normalize";
import type {
  Patient,
  Appointment,
  Prescription,
  LaboratoryRequest,
  Referral,
  ClinicalEncounter,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  SectionCard,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard, CompactListItem } from "@/components/healthcare/compact-list";
import {
  AlertCircle, Activity, Pill, FlaskConical, Share2,
  Stethoscope, FileText, Phone, Mail, MapPin, Calendar, PlayCircle, FileSearch,
  ShieldCheck, User, Clock,
} from "lucide-react";
import { formatDate, formatTime, relativeDay, fullName, age, initials } from "@/lib/format";
import { toast } from "sonner";

type Tab = "overview" | "records" | "activity";

export function ProviderPatientDetail() {
  const { view } = useNav();
  const { providerId } = useProviderContext();
  const id = view.params.id;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, appts, rxs, labs, refs, encs] = await Promise.all([
        patientService.get(id),
        appointmentService.list({ patientId: id }),
        prescriptionService.list({ patientId: id }),
        labRequestService.list({ patientId: id }),
        referralService.list({ patientId: id }),
        resource.list<ClinicalEncounter>("clinicalEncounter", { patientId: id }),
      ]);
      setPatient(normalizePatient(p));
      setAppointments(appts);
      setPrescriptions(rxs);
      setLabRequests(labs.map(normalizeLabRequest));
      setReferrals(refs.map(normalizeReferral));
      setEncounters(encs.map(normalizeEncounter));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load patient.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function startNewEncounter(appt: Appointment) {
    if (!providerId) return;
    try {
      const enc = await encounterService.start(appt.id, providerId);
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: enc.id });
    } catch (e) {
      toast.error("Could not start encounter: " + (e as Error).message);
    }
  }

  if (loading) return <LoadingState label="Loading patient record…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!patient) return <ErrorState message="Patient not found." />;

  const activeAllergies = patient.allergies.filter((a) => a.status === "active");
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingAppts = appointments
    .filter((a) => a.date >= todayStr && ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const pastAppts = appointments
    .filter((a) => a.date < todayStr || ["completed", "no_show", "cancelled"].includes(a.status))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const labResults = labRequests.filter((l) => l.result);

  return (
    <div>
      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        description={`${patient.patientNumber} · ${age(patient.dateOfBirth) ?? "—"} years · ${patient.gender}`}
        breadcrumbs={[
          { label: "Patients", onClick: () => navigate("provider", "patients") },
          { label: patient.patientNumber },
        ]}
        back
        actions={
          upcomingAppts.length > 0 ? (
            <Button size="sm" onClick={() => startNewEncounter(upcomingAppts[0])}>
              <PlayCircle className="h-4 w-4 mr-1" /> Start encounter
            </Button>
          ) : undefined
        }
      />

      {/* Patient identity banner */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-soft">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {initials(fullName(patient))}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{fullName(patient)}</p>
          <p className="text-xs text-muted-foreground truncate">
            {age(patient.dateOfBirth) ?? "—"}y · {patient.gender} · {patient.bloodGroup ?? "?"} · {patient.genotype ?? "—"}
          </p>
        </div>
        {activeAllergies.length > 0 ? (
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 shrink-0">
            <AlertCircle className="h-3 w-3 mr-1" /> {activeAllergies.length} allergy{activeAllergies.length > 1 ? "ies" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
            <ShieldCheck className="h-3 w-3 mr-1" /> No allergies
          </Badge>
        )}
      </div>

      {/* Upcoming appointment inline */}
      {upcomingAppts.length > 0 && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2 shrink-0">
            <Calendar className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800 truncate">
              {relativeDay(upcomingAppts[0].date)} · {formatTime(upcomingAppts[0].time)}
            </p>
            <p className="text-xs text-emerald-700 capitalize truncate">
              {upcomingAppts[0].consultationChannel.replace(/_/g, " ")} · {upcomingAppts[0].status.replace(/_/g, " ")}
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-100" onClick={() => navigate("provider", "appointment", { id: upcomingAppts[0].id })}>
            View
          </Button>
        </div>
      )}

      {/* SegmentedControl */}
      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-4">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "overview", label: "Overview", icon: User },
            { value: "records", label: "Records", icon: FileText },
            { value: "activity", label: "Activity", icon: Activity },
          ]}
        />
      </div>

      {/* ===================== OVERVIEW TAB ===================== */}
      {tab === "overview" && (
        <div className="space-y-3">
          {/* Demographics */}
          <SectionCard icon={FileText} title="Demographics" dense contentClassName="p-0">
            <div className="p-4 space-y-3 border-b border-border/60">
              <div className="grid sm:grid-cols-2 gap-2.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" /> <span>{formatDate(patient.dateOfBirth)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> <span>{patient.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{patient.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> <span>{patient.city}, {patient.state}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-border/60 border-b border-border/60">
              <div className="p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Blood</p>
                <p className="font-semibold mt-0.5">{patient.bloodGroup ?? "—"}</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Genotype</p>
                <p className="font-semibold mt-0.5">{patient.genotype ?? "—"}</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Height</p>
                <p className="font-semibold mt-0.5">{patient.height ? `${patient.height}cm` : "—"}</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Weight</p>
                <p className="font-semibold mt-0.5">{patient.weight ? `${patient.weight}kg` : "—"}</p>
              </div>
            </div>
            {patient.emergencyName && (
              <div className="p-3 bg-amber-50 border-b border-amber-200">
                <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Emergency contact</p>
                <p className="text-xs mt-1 font-medium text-amber-900">{patient.emergencyName}</p>
                <p className="text-xs text-amber-700">{patient.emergencyPhone} ({patient.emergencyRel})</p>
              </div>
            )}
          </SectionCard>

          {/* Allergy banner */}
          {activeAllergies.length > 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
              <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Allergy alert ({activeAllergies.length})
              </p>
              <div className="space-y-2">
                {patient.allergies.map((a, i) => (
                  <div key={i} className="text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-rose-800">{a.name}</span>
                      <p className="text-xs text-rose-600 mt-0.5 capitalize">{a.source.replace(/_/g, " ")} · {formatDate(a.recordedAt)}</p>
                    </div>
                    {a.status === "resolved" ? (
                      <Badge variant="outline" className="h-5 text-[10px] shrink-0">resolved</Badge>
                    ) : (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px] shrink-0">active</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-sm text-emerald-700">No known active allergies.</span>
            </div>
          )}

          {/* Conditions */}
          <ExpandableCard
            title="Conditions"
            subtitle={`${patient.conditions.length} recorded`}
            leading={<div className="rounded-lg bg-amber-50 p-2"><Activity className="h-4 w-4 text-amber-600" /></div>}
            defaultOpen
          >
            {patient.conditions.length === 0 ? <p className="text-xs text-muted-foreground">None recorded.</p> : (
              <ul className="space-y-2">
                {patient.conditions.map((c, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.status === "active"
                        ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]">active</Badge>
                        : <Badge variant="outline" className="h-5 text-[10px]">resolved</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{c.source.replace(/_/g, " ")} · {formatDate(c.recordedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </ExpandableCard>

          {/* Medications */}
          <ExpandableCard
            title="Medications"
            subtitle={`${patient.medications.length} on record`}
            leading={<div className="rounded-lg bg-violet-50 p-2"><Pill className="h-4 w-4 text-violet-600" /></div>}
          >
            {patient.medications.length === 0 ? <p className="text-xs text-muted-foreground">None on record.</p> : (
              <ul className="space-y-1.5">
                {patient.medications.map((m, i) => (
                  <li key={i} className="text-sm flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize h-5">{m.source.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </ExpandableCard>
        </div>
      )}

      {/* ===================== RECORDS TAB ===================== */}
      {tab === "records" && (
        <div className="space-y-3">
          {/* Encounters */}
          <ExpandableCard
            title="Encounters"
            subtitle={`${encounters.length} on record`}
            leading={<div className="rounded-lg bg-sky-50 p-2"><Stethoscope className="h-4 w-4 text-sky-600" /></div>}
            defaultOpen
          >
            {encounters.length === 0 ? (
              <EmptyState icon={Stethoscope} title="No encounters" description="This patient has no recorded clinical encounters." compact />
            ) : (
              <div className="divide-y divide-border/40 -mx-1">
                {encounters
                  .sort((a, b) => ((b as WithTimestamps<ClinicalEncounter>).createdAt ?? "").localeCompare((a as WithTimestamps<ClinicalEncounter>).createdAt ?? ""))
                  .map((e) => (
                    <CompactListItem
                      key={e.id}
                      title={e.encounterNumber}
                      subtitle={`${formatDate(e.createdAt)} · ${e.provider ? `${e.provider.title} ${e.provider.lastName}` : "—"}${e.documentation && typeof e.documentation === "object" && (e.documentation as { diagnosis?: string }).diagnosis ? ` · ${(e.documentation as { diagnosis?: string }).diagnosis}` : ""}`}
                      trailing={
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={e.status} size="sm" />
                          {e.locked && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 h-5 text-[10px]">signed</Badge>}
                        </div>
                      }
                      onClick={() => navigate("provider", "encounter", { id: e.id })}
                      chevron
                    />
                  ))}
              </div>
            )}
          </ExpandableCard>

          {/* Prescriptions */}
          <ExpandableCard
            title="Prescriptions"
            subtitle={`${prescriptions.length} issued`}
            leading={<div className="rounded-lg bg-emerald-50 p-2"><Pill className="h-4 w-4 text-emerald-600" /></div>}
          >
            {prescriptions.length === 0 ? (
              <EmptyState icon={Pill} title="No prescriptions" description="No prescriptions have been issued to this patient." compact />
            ) : (
              <div className="space-y-2">
                {prescriptions
                  .sort((a, b) => ((b as WithTimestamps<Prescription>).createdAt ?? "").localeCompare((a as WithTimestamps<Prescription>).createdAt ?? ""))
                  .map((rx) => (
                    <div key={rx.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{rx.prescriptionNumber}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Issued {formatDate((rx as WithTimestamps<Prescription>).createdAt)} · {rx.items?.length ?? 0} item(s) · valid until {formatDate(rx.expiryDate)}
                          </p>
                        </div>
                        <StatusBadge status={rx.status} size="sm" />
                      </div>
                      {rx.items && rx.items.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs border-t border-border/60 pt-2">
                          {rx.items.map((it) => (
                            <li key={it.id} className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">{it.medicine} {it.strength} · {it.dose} {it.frequency}</span>
                              <span className="text-muted-foreground shrink-0">Qty {it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </ExpandableCard>

          {/* Lab results */}
          <ExpandableCard
            title="Lab results"
            subtitle={`${labResults.length} available`}
            leading={<div className="rounded-lg bg-violet-50 p-2"><FlaskConical className="h-4 w-4 text-violet-600" /></div>}
          >
            {labResults.length === 0 ? (
              <EmptyState icon={FlaskConical} title="No lab results" description="No laboratory results available for this patient." compact />
            ) : (
              <div className="space-y-2">
                {labResults.map((l) => (
                  <div key={l.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{l.result?.test}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{l.result?.resultDate ? formatDate(l.result.resultDate) : "—"}</p>
                        <p className="text-sm mt-1.5">
                          <span className="font-semibold">{l.result?.value}</span> <span className="text-muted-foreground">{l.result?.unit}</span>
                          <span className="text-xs text-muted-foreground ml-2">(ref {l.result?.referenceRange})</span>
                        </p>
                      </div>
                      {l.result?.abnormalIndicator && l.result.abnormalIndicator !== "normal" ? (
                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 capitalize h-5 text-[10px]">{l.result.abnormalIndicator}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 h-5 text-[10px]">normal</Badge>
                      )}
                    </div>
                    {l.result?.interpretation && (
                      <p className="text-xs text-muted-foreground mt-2 border-t border-border/60 pt-2 leading-relaxed">{l.result.interpretation}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ExpandableCard>

          {/* Referrals */}
          <ExpandableCard
            title="Referrals"
            subtitle={`${referrals.length} total`}
            leading={<div className="rounded-lg bg-amber-50 p-2"><Share2 className="h-4 w-4 text-amber-600" /></div>}
          >
            {referrals.length === 0 ? (
              <EmptyState icon={Share2} title="No referrals" description="No referrals for this patient." compact />
            ) : (
              <div className="divide-y divide-border/40 -mx-1">
                {referrals.map((r) => (
                  <CompactListItem
                    key={r.id}
                    title={r.reason}
                    subtitle={
                      r.recipient
                        ? `To ${r.recipient.title} ${r.recipient.lastName} · ${formatDate((r as WithTimestamps<Referral>).createdAt)}`
                        : `Open · ${r.recipientSpecialty ?? "any"} · ${formatDate((r as WithTimestamps<Referral>).createdAt)}`
                    }
                    trailing={<StatusBadge status={r.status} size="sm" />}
                    onClick={() => navigate("provider", "patient", { id: r.patientId })}
                  />
                ))}
              </div>
            )}
          </ExpandableCard>
        </div>
      )}

      {/* ===================== ACTIVITY TAB ===================== */}
      {tab === "activity" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
              Upcoming ({upcomingAppts.length})
            </p>
            {upcomingAppts.length === 0 ? (
              <EmptyState icon={Calendar} title="No upcoming appointments" description="Future consultations will appear here." compact />
            ) : (
              <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
                {upcomingAppts.map((a) => (
                  <CompactListItem
                    key={a.id}
                    leading={<div className="rounded-lg bg-emerald-50 p-1.5"><Calendar className="h-4 w-4 text-emerald-600" /></div>}
                    title={`${relativeDay(a.date)} · ${formatTime(a.time)}`}
                    subtitle={`${a.consultationChannel.replace(/_/g, " ")} · ${intakeReason(a)}`}
                    trailing={<StatusBadge status={a.status} size="sm" />}
                    onClick={() => navigate("provider", "appointment", { id: a.id })}
                    chevron
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
              Past appointments ({pastAppts.length})
            </p>
            {pastAppts.length === 0 ? (
              <EmptyState icon={Clock} title="No past appointments" description="Past consultations will appear here." compact />
            ) : (
              <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
                {pastAppts.slice(0, 15).map((a) => (
                  <CompactListItem
                    key={a.id}
                    leading={<div className="rounded-lg bg-muted p-1.5"><Clock className="h-4 w-4 text-muted-foreground" /></div>}
                    title={`${formatDate(a.date)} · ${formatTime(a.time)}`}
                    subtitle={a.consultationChannel.replace(/_/g, " ")}
                    trailing={<StatusBadge status={a.status} size="sm" />}
                    onClick={() => navigate("provider", "appointment", { id: a.id })}
                    chevron
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 flex items-center gap-3">
            <FileSearch className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground flex-1 leading-relaxed">
              This is a read-only clinical view. Start a new encounter from an existing appointment, or from the appointments list.
            </p>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("provider", "appointments")}>
              <FileText className="h-4 w-4 mr-1" /> Appointments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Kept for compat with intakeReason lookup on this page.
function intakeReason(a: Appointment): string {
  const intake = a.intakeForm as unknown;
  if (intake && typeof intake === "object") {
    const r = (intake as Record<string, unknown>).reason;
    if (typeof r === "string" && r) return r;
  }
  return "—";
}
