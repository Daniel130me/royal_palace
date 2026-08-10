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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/healthcare/page-header";
import {
  AlertCircle, Activity, Pill, FlaskConical, Share2,
  Stethoscope, FileText, Phone, Mail, MapPin, Calendar, PlayCircle, FileSearch, ArrowRight, ShieldCheck,
} from "lucide-react";
import { formatDate, formatTime, relativeDay, fullName, age, initials } from "@/lib/format";
import { toast } from "sonner";

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
  const upcomingAppts = appointments.filter((a) => a.date >= new Date().toISOString().slice(0, 10) && ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status));

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
      />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {/* Left: demographics + summary */}
        <div className="space-y-5">
          {/* Demographics */}
          <SectionCard icon={FileText} title="Demographics">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                    {initials(fullName(patient))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{fullName(patient)}</p>
                  <p className="text-xs text-muted-foreground">{patient.patientNumber}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2.5 text-sm">
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
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Blood group</p><p className="font-medium mt-0.5">{patient.bloodGroup ?? "—"}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Genotype</p><p className="font-medium mt-0.5">{patient.genotype ?? "—"}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Height</p><p className="font-medium mt-0.5">{patient.height ? `${patient.height}cm` : "—"}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</p><p className="font-medium mt-0.5">{patient.weight ? `${patient.weight}kg` : "—"}</p></div>
              </div>
              {patient.emergencyName && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Emergency contact</p>
                  <p className="text-xs mt-1 font-medium text-amber-900">{patient.emergencyName}</p>
                  <p className="text-xs text-amber-700">{patient.emergencyPhone} ({patient.emergencyRel})</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Allergies */}
          <SectionCard
            icon={AlertCircle}
            title="Allergies"
            className={activeAllergies.length > 0 ? "border-rose-200" : ""}
            action={activeAllergies.length > 0 ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{activeAllergies.length} active</Badge> : undefined}
          >
            {activeAllergies.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                <span>No known active allergies.</span>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {patient.allergies.map((a, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-rose-800">{a.name}</span>
                      {a.status === "resolved" ? <Badge variant="outline" className="h-5 text-[10px]">resolved</Badge> : <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">Source: {a.source.replace(/_/g, " ")} · {formatDate(a.recordedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Conditions */}
          <SectionCard icon={Activity} title="Conditions">
            {patient.conditions.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : (
              <ul className="space-y-2.5">
                {patient.conditions.map((c, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.status === "active" ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]">active</Badge> : <Badge variant="outline" className="h-5 text-[10px]">resolved</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{c.source.replace(/_/g, " ")} · {formatDate(c.recordedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Medications */}
          <SectionCard icon={Pill} title="Medications">
            {patient.medications.length === 0 ? <p className="text-sm text-muted-foreground">None on record.</p> : (
              <ul className="space-y-1.5">
                {patient.medications.map((m, i) => (
                  <li key={i} className="text-sm flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize h-5">{m.source.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right: clinical history tabs */}
        <div className="lg:col-span-2 space-y-5">
          {upcomingAppts.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-2">Upcoming appointment</p>
              {upcomingAppts.slice(0, 1).map((a) => (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{relativeDay(a.date)} · {formatTime(a.time)}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{a.consultationChannel.replace(/_/g, " ")} · {a.status.replace(/_/g, " ")}</p>
                  </div>
                  <Button size="sm" onClick={() => startNewEncounter(a)}>
                    <PlayCircle className="h-4 w-4 mr-1" /> Start encounter
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Tabs defaultValue="encounters">
            <div className="overflow-x-auto -mx-1 px-1 pb-1">
              <TabsList>
                <TabsTrigger value="encounters">Encounters ({encounters.length})</TabsTrigger>
                <TabsTrigger value="prescriptions">Prescriptions ({prescriptions.length})</TabsTrigger>
                <TabsTrigger value="labs">Lab Results ({labRequests.filter((l) => l.result).length})</TabsTrigger>
                <TabsTrigger value="referrals">Referrals ({referrals.length})</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="encounters" className="mt-3 space-y-3">
              {encounters.length === 0 ? (
                <EmptyState icon={Stethoscope} title="No encounters" description="This patient has no recorded clinical encounters." compact />
              ) : (
                encounters
                  .sort((a, b) => ((b as WithTimestamps<ClinicalEncounter>).createdAt ?? "").localeCompare((a as WithTimestamps<ClinicalEncounter>).createdAt ?? ""))
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => navigate("provider", "encounter", { id: e.id })}
                      className="block w-full text-left rounded-2xl border border-border/80 bg-card p-4 hover:shadow-soft-md transition-shadow tap-highlight-none"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{e.encounterNumber}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.createdAt)} · {e.provider ? `${e.provider.title} ${e.provider.lastName}` : "—"}</p>
                          {e.documentation && typeof e.documentation === "object" && (e.documentation as { diagnosis?: string }).diagnosis && (
                            <p className="text-xs mt-1.5 text-foreground"><span className="text-muted-foreground">Diagnosis:</span> {(e.documentation as { diagnosis?: string }).diagnosis}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={e.status} size="sm" />
                          {e.locked && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 h-5 text-[10px]">signed</Badge>}
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </TabsContent>

            <TabsContent value="prescriptions" className="mt-3 space-y-3">
              {prescriptions.length === 0 ? (
                <EmptyState icon={Pill} title="No prescriptions" description="No prescriptions have been issued to this patient." compact />
              ) : (
                prescriptions
                  .sort((a, b) => ((b as WithTimestamps<Prescription>).createdAt ?? "").localeCompare((a as WithTimestamps<Prescription>).createdAt ?? ""))
                  .map((rx) => (
                    <div key={rx.id} className="rounded-2xl border border-border/80 bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{rx.prescriptionNumber}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Issued {formatDate((rx as WithTimestamps<Prescription>).createdAt)} · {rx.items?.length ?? 0} item(s)</p>
                          <p className="text-xs text-muted-foreground">Valid until {formatDate(rx.expiryDate)}</p>
                        </div>
                        <StatusBadge status={rx.status} size="sm" />
                      </div>
                      {rx.items && rx.items.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs border-t border-border/60 pt-3">
                          {rx.items.map((it) => (
                            <li key={it.id} className="flex items-center justify-between gap-2">
                              <span className="font-medium">{it.medicine} {it.strength} · {it.dose} {it.frequency}</span>
                              <span className="text-muted-foreground shrink-0">Qty {it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
              )}
            </TabsContent>

            <TabsContent value="labs" className="mt-3 space-y-3">
              {labRequests.filter((l) => l.result).length === 0 ? (
                <EmptyState icon={FlaskConical} title="No lab results" description="No laboratory results available for this patient." compact />
              ) : (
                labRequests.filter((l) => l.result).map((l) => (
                  <div key={l.id} className="rounded-2xl border border-border/80 bg-card p-4">
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
                      <p className="text-xs text-muted-foreground mt-3 border-t border-border/60 pt-3 leading-relaxed">{l.result.interpretation}</p>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="referrals" className="mt-3 space-y-3">
              {referrals.length === 0 ? (
                <EmptyState icon={Share2} title="No referrals" description="No referrals for this patient." compact />
              ) : (
                referrals.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-border/80 bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{r.reason}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {r.recipient ? `To ${r.recipient.title} ${r.recipient.lastName} (${r.recipient.specialty})` : `Open referral · ${r.recipientSpecialty ?? "any"}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">From {r.sender ? `${r.sender.title} ${r.sender.lastName}` : "—"} · {formatDate((r as WithTimestamps<Referral>).createdAt)}</p>
                      </div>
                      <StatusBadge status={r.status} size="sm" />
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>

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
      </div>
    </div>
  );
}
