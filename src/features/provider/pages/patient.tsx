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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatDate, formatTime, relativeDay, fullName, age } from "@/lib/format";
import { toast } from "sonner";
import {
  ArrowLeft, User, AlertCircle, Activity, Pill, FlaskConical, Share2,
  Stethoscope, FileText, Phone, Mail, MapPin, Calendar, PlayCircle, FileSearch,
} from "lucide-react";

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
  const activeConditions = patient.conditions.filter((c) => c.status === "active");
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
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("provider", "patients")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: demographics + summary */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                  {patient.firstName[0]}{patient.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{fullName(patient)}</p>
                  <p className="text-xs text-muted-foreground">{patient.patientNumber}</p>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> <span>{formatDate(patient.dateOfBirth)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> <span>{patient.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> <span className="truncate">{patient.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> <span>{patient.city}, {patient.state}</span>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Blood group</p><p className="font-medium">{patient.bloodGroup ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Genotype</p><p className="font-medium">{patient.genotype ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Height</p><p className="font-medium">{patient.height ? `${patient.height}cm` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Weight</p><p className="font-medium">{patient.weight ? `${patient.weight}kg` : "—"}</p></div>
              </div>
              {patient.emergencyName && (
                <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-2">
                  <p className="text-xs text-amber-700 font-medium">Emergency contact</p>
                  <p className="text-xs">{patient.emergencyName} · {patient.emergencyPhone} ({patient.emergencyRel})</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-rose-200">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2 text-rose-800"><AlertCircle className="h-4 w-4" /> Allergies</CardTitle></CardHeader>
            <CardContent>
              {patient.allergies.length === 0 ? <p className="text-sm text-muted-foreground">No known allergies.</p> : (
                <ul className="space-y-2">
                  {patient.allergies.map((a, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.name}</span>
                        {a.status === "resolved" ? <Badge variant="outline">resolved</Badge> : <Badge variant="outline" className="border-rose-200 text-rose-700">active</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">Source: {a.source.replace("_", " ")} · {formatDate(a.recordedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Conditions</CardTitle></CardHeader>
            <CardContent>
              {patient.conditions.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : (
                <ul className="space-y-2">
                  {patient.conditions.map((c, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        {c.status === "active" ? <Badge variant="outline" className="border-amber-200 text-amber-700">active</Badge> : <Badge variant="outline">resolved</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.source.replace("_", " ")} · {formatDate(c.recordedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" /> Medications</CardTitle></CardHeader>
            <CardContent>
              {patient.medications.length === 0 ? <p className="text-sm text-muted-foreground">None on record.</p> : (
                <ul className="space-y-1">
                  {patient.medications.map((m, i) => (
                    <li key={i} className="text-sm flex items-center justify-between">
                      <span>{m.name}</span>
                      <Badge variant="outline" className="text-[10px]">{m.source.replace("_", " ")}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: clinical history tabs */}
        <div className="lg:col-span-2 space-y-6">
          {upcomingAppts.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-emerald-800 uppercase mb-2">Upcoming appointment</p>
                {upcomingAppts.slice(0, 1).map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{relativeDay(a.date)} · {formatTime(a.time)}</p>
                      <p className="text-xs text-muted-foreground">{a.consultationChannel.replace("_", " ")} · {a.status}</p>
                    </div>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => startNewEncounter(a)}>
                      <PlayCircle className="h-4 w-4 mr-1" /> Start encounter
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="encounters">
            <TabsList>
              <TabsTrigger value="encounters">Encounters ({encounters.length})</TabsTrigger>
              <TabsTrigger value="prescriptions">Prescriptions ({prescriptions.length})</TabsTrigger>
              <TabsTrigger value="labs">Lab Results ({labRequests.filter((l) => l.result).length})</TabsTrigger>
              <TabsTrigger value="referrals">Referrals ({referrals.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="encounters" className="mt-3 space-y-3">
              {encounters.length === 0 ? (
                <EmptyState icon={Stethoscope} title="No encounters" description="This patient has no recorded clinical encounters." />
              ) : (
                encounters
                  .sort((a, b) => ((b as WithTimestamps<ClinicalEncounter>).createdAt ?? "").localeCompare((a as WithTimestamps<ClinicalEncounter>).createdAt ?? ""))
                  .map((e) => (
                    <Card key={e.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate("provider", "encounter", { id: e.id })}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{e.encounterNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(e.createdAt)} · {e.provider ? `${e.provider.title} ${e.provider.lastName}` : "—"}</p>
                            {e.documentation && typeof e.documentation === "object" && (e.documentation as { diagnosis?: string }).diagnosis && (
                              <p className="text-xs mt-1">Diagnosis: {(e.documentation as { diagnosis?: string }).diagnosis}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={e.status} />
                            {e.locked && <Badge variant="outline" className="border-rose-200 text-rose-700 text-[10px]">signed</Badge>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </TabsContent>

            <TabsContent value="prescriptions" className="mt-3 space-y-3">
              {prescriptions.length === 0 ? (
                <EmptyState icon={Pill} title="No prescriptions" description="No prescriptions have been issued to this patient." />
              ) : (
                prescriptions
                  .sort((a, b) => ((b as WithTimestamps<Prescription>).createdAt ?? "").localeCompare((a as WithTimestamps<Prescription>).createdAt ?? ""))
                  .map((rx) => (
                    <Card key={rx.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{rx.prescriptionNumber}</p>
                            <p className="text-xs text-muted-foreground">Issued {formatDate((rx as WithTimestamps<Prescription>).createdAt)} · {rx.items?.length ?? 0} item(s)</p>
                            <p className="text-xs text-muted-foreground">Valid until {formatDate(rx.expiryDate)}</p>
                          </div>
                          <StatusBadge status={rx.status} />
                        </div>
                        {rx.items && rx.items.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs">
                            {rx.items.map((it) => (
                              <li key={it.id} className="flex items-center justify-between border-t pt-1">
                                <span>{it.medicine} {it.strength} · {it.dose} {it.frequency}</span>
                                <span className="text-muted-foreground">Qty {it.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  ))
              )}
            </TabsContent>

            <TabsContent value="labs" className="mt-3 space-y-3">
              {labRequests.filter((l) => l.result).length === 0 ? (
                <EmptyState icon={FlaskConical} title="No lab results" description="No laboratory results available for this patient." />
              ) : (
                labRequests.filter((l) => l.result).map((l) => (
                  <Card key={l.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{l.result?.test}</p>
                          <p className="text-xs text-muted-foreground">{l.result?.resultDate ? formatDate(l.result.resultDate) : "—"}</p>
                          <p className="text-sm mt-1">
                            <span className="font-medium">{l.result?.value}</span> <span className="text-muted-foreground">{l.result?.unit}</span>
                            <span className="text-xs text-muted-foreground ml-2">(ref {l.result?.referenceRange})</span>
                          </p>
                        </div>
                        {l.result?.abnormalIndicator && l.result.abnormalIndicator !== "normal" ? (
                          <Badge variant="outline" className="border-rose-200 text-rose-700 capitalize">{l.result.abnormalIndicator}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-200 text-emerald-700">normal</Badge>
                        )}
                      </div>
                      {l.result?.interpretation && (
                        <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{l.result.interpretation}</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="referrals" className="mt-3 space-y-3">
              {referrals.length === 0 ? (
                <EmptyState icon={Share2} title="No referrals" description="No referrals for this patient." />
              ) : (
                referrals.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.recipient ? `To ${r.recipient.title} ${r.recipient.lastName} (${r.recipient.specialty})` : `Open referral · ${r.recipientSpecialty ?? "any"}`}
                          </p>
                          <p className="text-xs text-muted-foreground">From {r.sender ? `${r.sender.title} ${r.sender.lastName}` : "—"} · {formatDate((r as WithTimestamps<Referral>).createdAt)}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>

          <Card className="bg-muted/30">
            <CardContent className="p-4 flex items-center gap-3">
              <FileSearch className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground flex-1">
                This is a read-only clinical view. Start a new encounter from an existing appointment, or from the appointments list.
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate("provider", "appointments")}>
                <FileText className="h-4 w-4 mr-1" /> Appointments
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
