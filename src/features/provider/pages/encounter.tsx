"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import {
  encounterService,
  patientService,
  appointmentService,
  prescriptionService,
  labRequestService,
} from "@/lib/services";
import {
  normalizeEncounter,
  normalizePatient,
  normalizeLabRequest,
} from "../normalize";
import type {
  ClinicalEncounter,
  Patient,
  Appointment,
  Prescription,
  LaboratoryRequest,
  EncounterDocumentation,
  FileMeta,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  ArrowLeft, User, AlertCircle, Activity, Pill, FlaskConical, ChevronDown,
  CalendarClock, Stethoscope, Save, Lock, CheckCircle2, Send, Share2,
  FlaskConical as LabIcon, FileText, Plus, MessageSquare, Clock,
} from "lucide-react";
import { PrescriptionDialog } from "../prescription-dialog";
import { LabRequestDialog } from "../lab-request-dialog";
import { ReferralDialog } from "../referral-dialog";
import { formatCurrency, formatDate, formatTime, relativeDay, fullName, age } from "@/lib/format";

const REQUIRED_FIELDS: { key: keyof EncounterDocumentation; label: string }[] = [
  { key: "consultationReason", label: "Consultation Reason" },
  { key: "relevantMedicalHistory", label: "Relevant Medical History" },
  { key: "allergyConfirmation", label: "Allergy Confirmation" },
  { key: "medicationHistory", label: "Medication History" },
  { key: "assessment", label: "Assessment" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "treatmentPlan", label: "Treatment Plan" },
  { key: "followUp", label: "Follow-Up" },
];

const VITAL_KEYS: { key: string; label: string; placeholder: string }[] = [
  { key: "bp", label: "Blood Pressure", placeholder: "120/80" },
  { key: "pulse", label: "Pulse (bpm)", placeholder: "72" },
  { key: "temp", label: "Temp (°C)", placeholder: "36.8" },
  { key: "respRate", label: "Resp Rate (/min)", placeholder: "16" },
  { key: "weight", label: "Weight (kg)", placeholder: "68" },
  { key: "height", label: "Height (cm)", placeholder: "170" },
];

// The action route accepts `diagnosisCode` as part of the documentation payload
// even though it is not part of the canonical EncounterDocumentation type.
// We extend it locally to type the autosave / complete payloads safely.
type DocWithCode = EncounterDocumentation & { diagnosisCode?: string };

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between py-2.5 text-left hover:bg-accent/40 px-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {title}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SoapField({ label, value, onChange, disabled, placeholder, required }: {
  label: string; value: string | undefined; onChange: (v: string) => void; disabled: boolean; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <Textarea
        rows={2}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}

export function ProviderEncounter() {
  const { view } = useNav();
  const id = view.params.id;
  const [encounter, setEncounter] = useState<ClinicalEncounter | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<EncounterDocumentation>({});
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [attachments, setAttachments] = useState<FileMeta[]>([]);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [completing, setCompleting] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [rxOpen, setRxOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  // autosave bookkeeping
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const providerId = useNav((s) => s.session?.profileId ?? "");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const enc = await encounterService.get(id);
      const norm = normalizeEncounter(enc);
      setEncounter(norm);
      const initialDoc = norm.documentation;
      setDoc(initialDoc);
      setDiagnosisCode(initialDoc.diagnosis ? (initialDoc as EncounterDocumentation & { diagnosisCode?: string }).diagnosisCode ?? "" : "");
      setAttachments(initialDoc.attachments ?? []);
      lastSavedRef.current = JSON.stringify(initialDoc);

      if (norm.patientId) {
        const [p, appts, rxs, labs] = await Promise.all([
          patientService.get(norm.patientId),
          appointmentService.list({ patientId: norm.patientId }),
          prescriptionService.list({ patientId: norm.patientId }),
          labRequestService.list({ patientId: norm.patientId }),
        ]);
        setPatient(normalizePatient(p));
        setHistory(appts);
        setPrescriptions(rxs);
        setLabRequests(labs.map(normalizeLabRequest));
      }
    } catch (e) {
      setError((e as Error).message ?? "Failed to load encounter.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Autosave: debounced 1.5s after last keystroke
  const docJson = JSON.stringify(doc);
  useEffect(() => {
    if (!encounter || encounter.locked) return;
    if (docJson === lastSavedRef.current) return;
    setSaving("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const payload: DocWithCode = { ...doc, diagnosisCode, attachments };
        await encounterService.update(encounter.id, payload);
        lastSavedRef.current = JSON.stringify(doc);
        setSaving("saved");
        setTimeout(() => setSaving("idle"), 1500);
      } catch (e) {
        toast.error("Autosave failed: " + (e as Error).message);
        setSaving("idle");
      }
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, diagnosisCode, attachments, encounter]);

  function update<K extends keyof EncounterDocumentation>(key: K, value: EncounterDocumentation[K]) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }
  function updateVital(key: string, value: string) {
    setDoc((prev) => ({ ...prev, vitalSigns: { ...(prev.vitalSigns ?? {}), [key]: value } }));
  }
  function addMockAttachment() {
    const names = ["EKG.pdf", "Patient-Photo.jpg", "Wound.jpg", "Lab-Requisition.pdf"];
    const name = names[Math.floor(Math.random() * names.length)];
    setAttachments((prev) => [
      ...prev,
      { id: `ATT-${Date.now().toString(36)}`, name, type: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg", size: 100_000 + Math.floor(Math.random() * 200_000), uploadedAt: new Date().toISOString() },
    ]);
  }
  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function complete() {
    if (!encounter) return;
    const missing = REQUIRED_FIELDS.filter((f) => !doc[f.key] || String(doc[f.key]).trim() === "").map((f) => f.label);
    if (missing.length > 0) {
      setMissingFields(missing);
      toast.error(`Cannot complete: ${missing.length} required field(s) missing.`);
      return;
    }
    setMissingFields([]);
    setCompleting(true);
    try {
      const payload: DocWithCode = { ...doc, diagnosisCode, attachments };
      await encounterService.complete(encounter.id, payload, providerId);
      toast.success("Consultation completed and clinical record signed.");
      await load();
    } catch (e) {
      toast.error("Could not complete encounter: " + (e as Error).message);
    } finally {
      setCompleting(false);
    }
  }

  const locked = !!encounter?.locked;
  const recentEncounters = useMemo(
    () => history.filter((a) => a.encounter && a.encounter.id !== id).slice(0, 5),
    [history, id]
  );
  const recentLabs = useMemo(
    () => labRequests.filter((l) => l.result).slice(0, 5),
    [labRequests]
  );
  const activeRx = useMemo(
    () => prescriptions.filter((p) => ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(p.status)).slice(0, 5),
    [prescriptions]
  );

  if (loading) return <LoadingState label="Loading encounter workspace…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!encounter) return <ErrorState message="Encounter not found." />;
  if (!patient) return <ErrorState message="Patient record missing." />;

  return (
    <div>
      {/* Top header bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("provider", "appointments")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              Encounter {encounter.encounterNumber}
            </h1>
            <p className="text-xs text-muted-foreground">
              {patient.firstName} {patient.lastName} · {patient.patientNumber} · Started {formatDate(encounter.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={encounter.status} />
          {locked ? (
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
              <Lock className="h-3 w-3 mr-1" /> Signed
            </Badge>
          ) : (
            <Badge variant="outline" className={saving === "saving" ? "border-amber-200 bg-amber-50 text-amber-700" : saving === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
              {saving === "saving" ? (<><Save className="h-3 w-3 mr-1 animate-pulse" /> Saving…</>) :
               saving === "saved" ? (<><CheckCircle2 className="h-3 w-3 mr-1" /> Saved</>) :
               (<><Save className="h-3 w-3 mr-1" /> Autosave on</>)}
            </Badge>
          )}
        </div>
      </div>

      {locked && (
        <Alert className="mb-4 border-rose-200 bg-rose-50">
          <Lock className="h-4 w-4 text-rose-600" />
          <AlertTitle className="text-rose-800">Signed clinical record — this consultation is locked.</AlertTitle>
          <AlertDescription className="text-rose-700">
            Signed on {encounter.signedAt ? formatDate(encounter.signedAt) : "—"} by {encounter.provider ? `${encounter.provider.title} ${encounter.provider.lastName}` : "the consulting provider"}. The documentation below is read-only.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_300px]">
        {/* LEFT: Patient summary */}
        <div>
          <Card className="lg:sticky lg:top-16">
            <CardContent className="p-0">
              <div className="p-3 border-b flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                  {patient.firstName[0]}{patient.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{patient.firstName} {patient.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{patient.patientNumber}</p>
                  <p className="text-xs text-muted-foreground">{age(patient.dateOfBirth) ?? "—"}y · {patient.gender} · {patient.bloodGroup ?? "?"}</p>
                </div>
              </div>

              {/* Allergies (always visible, prominent) */}
              {patient.allergies.length > 0 && (
                <div className="p-3 border-b bg-rose-50">
                  <p className="text-xs font-bold text-rose-700 uppercase mb-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Allergies
                  </p>
                  <div className="space-y-1">
                    {patient.allergies.map((a, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-rose-800">{a.name}</span>
                        <span className="text-rose-500 ml-1">· {a.source.replace("_", " ")}</span>
                        {a.status === "resolved" && <Badge variant="outline" className="ml-1 text-[10px]">resolved</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Section title="Active conditions" icon={Activity}>
                {patient.conditions.filter((c) => c.status === "active").length === 0 ? (
                  <p className="text-xs text-muted-foreground">None recorded.</p>
                ) : (
                  <ul className="space-y-1">
                    {patient.conditions.filter((c) => c.status === "active").map((c, i) => (
                      <li key={i} className="text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-1">· {c.source.replace("_", " ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Current medications" icon={Pill} defaultOpen={false}>
                {patient.medications.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None on record.</p>
                ) : (
                  <ul className="space-y-1">
                    {patient.medications.map((m, i) => (
                      <li key={i} className="text-xs">{m.name}</li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent consultations" icon={Stethoscope} defaultOpen={false}>
                {recentEncounters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prior encounters.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {recentEncounters.map((a) => (
                      <li key={a.id} className="text-xs">
                        <button className="text-left w-full hover:underline" onClick={() => a.encounter && navigate("provider", "encounter", { id: a.encounter!.id })}>
                          <span className="font-medium">{formatDate(a.date)}</span> · {a.provider ? `${a.provider.lastName}` : ""}
                          {a.encounter?.documentation && typeof a.encounter.documentation === "object" && (
                            <span className="block text-muted-foreground truncate">
                              {(a.encounter.documentation as EncounterDocumentation).diagnosis ?? "—"}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent lab results" icon={FlaskConical} defaultOpen={false}>
                {recentLabs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No results yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {recentLabs.map((l) => (
                      <li key={l.id} className="text-xs">
                        <span className="font-medium">{l.result?.test}</span>
                        <span className="text-muted-foreground ml-1">{l.result?.value} {l.result?.unit}</span>
                        {l.result?.abnormalIndicator && l.result.abnormalIndicator !== "normal" && (
                          <Badge variant="outline" className="ml-1 text-[10px] border-rose-200 text-rose-700">{l.result.abnormalIndicator}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Active prescriptions" icon={Pill} defaultOpen={false}>
                {activeRx.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active prescriptions.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activeRx.map((rx) => (
                      <li key={rx.id} className="text-xs">
                        <span className="font-medium">{rx.prescriptionNumber}</span>
                        <span className="text-muted-foreground block">Expires {formatDate(rx.expiryDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </CardContent>
          </Card>
        </div>

        {/* CENTER: SOAP documentation */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Clinical documentation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingFields.length > 0 && (
                <Alert className="border-rose-200 bg-rose-50">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <AlertTitle className="text-rose-800">Required fields missing</AlertTitle>
                  <AlertDescription className="text-rose-700">
                    <ul className="list-disc ml-4 text-xs">
                      {missingFields.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <SoapField label="Consultation Reason" required value={doc.consultationReason} onChange={(v) => update("consultationReason", v)} disabled={locked} placeholder="Why the patient is being seen today." />
              <SoapField label="Chief Complaint" value={doc.chiefComplaint} onChange={(v) => update("chiefComplaint", v)} disabled={locked} placeholder="In the patient's own words." />
              <SoapField label="History of Present Illness" value={doc.historyPresentIllness} onChange={(v) => update("historyPresentIllness", v)} disabled={locked} placeholder="Onset, course, severity, modifying factors." />
              <SoapField label="Relevant Medical History" required value={doc.relevantMedicalHistory} onChange={(v) => update("relevantMedicalHistory", v)} disabled={locked} placeholder="Past conditions, hospitalisations, surgeries." />
              <SoapField label="Medication History" required value={doc.medicationHistory} onChange={(v) => update("medicationHistory", v)} disabled={locked} placeholder="Current and recent medications, adherence." />
              <SoapField label="Allergy Confirmation" required value={doc.allergyConfirmation} onChange={(v) => update("allergyConfirmation", v)} disabled={locked} placeholder="Confirm allergies reviewed with patient (or 'No known allergies')." />
              <div className="grid gap-3 sm:grid-cols-2">
                <SoapField label="Family History" value={doc.familyHistory} onChange={(v) => update("familyHistory", v)} disabled={locked} placeholder="Hereditary conditions." />
                <SoapField label="Social History" value={doc.socialHistory} onChange={(v) => update("socialHistory", v)} disabled={locked} placeholder="Occupation, smoking, alcohol, lifestyle." />
              </div>

              <Separator />

              {/* Vital signs grid */}
              <div>
                <Label className="text-xs font-medium">Vital Signs</Label>
                <div className="grid gap-3 sm:grid-cols-3 mt-1">
                  {VITAL_KEYS.map((v) => (
                    <div key={v.key}>
                      <Label className="text-[10px] text-muted-foreground">{v.label}</Label>
                      <Input
                        value={(doc.vitalSigns ?? {})[v.key] ?? ""}
                        onChange={(e) => updateVital(v.key, e.target.value)}
                        disabled={locked}
                        placeholder={v.placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <SoapField label="Examination Findings" value={doc.examinationFindings} onChange={(v) => update("examinationFindings", v)} disabled={locked} placeholder="System-by-system examination." />

              <Separator />

              <SoapField label="Assessment" required value={doc.assessment} onChange={(v) => update("assessment", v)} disabled={locked} placeholder="Clinical impression and reasoning." />
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <div>
                  <Label className="text-xs font-medium">Diagnosis {<span className="text-rose-500">*</span>}</Label>
                  <Input value={doc.diagnosis ?? ""} onChange={(e) => update("diagnosis", e.target.value)} disabled={locked} placeholder="e.g. Essential hypertension" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Provisional code</Label>
                  <Input value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)} disabled={locked} placeholder="e.g. I10 (ICD-10)" />
                </div>
              </div>
              <SoapField label="Differential Diagnosis" value={doc.differentialDiagnosis} onChange={(v) => update("differentialDiagnosis", v)} disabled={locked} placeholder="Alternative diagnoses considered." />
              <SoapField label="Treatment Plan" required value={doc.treatmentPlan} onChange={(v) => update("treatmentPlan", v)} disabled={locked} placeholder="Investigations, medications, interventions." />
              <SoapField label="Follow-Up" required value={doc.followUp} onChange={(v) => update("followUp", v)} disabled={locked} placeholder="When to review, what to monitor." />
              <SoapField label="Patient Instructions" value={doc.patientInstructions} onChange={(v) => update("patientInstructions", v)} disabled={locked} placeholder="Lifestyle, dosing, expected course." />
              <SoapField label="Safety-Netting" value={doc.safetyNetting} onChange={(v) => update("safetyNetting", v)} disabled={locked} placeholder="Red flags — when to return urgently." />

              <Separator />

              {/* Attachments (mock) */}
              <div>
                <Label className="text-xs font-medium">Attachments</Label>
                <div className="mt-2 space-y-2">
                  {attachments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No attachments.</p>
                  ) : (
                    attachments.map((f, i) => (
                      <div key={f.id} className="flex items-center justify-between rounded-md border p-2">
                        <div className="text-xs">
                          <span className="font-medium">{f.name}</span>
                          <span className="text-muted-foreground ml-2">{Math.round(f.size / 1024)} KB · {relativeDay(f.uploadedAt)}</span>
                        </div>
                        {!locked && (
                          <Button size="sm" variant="ghost" className="h-6 text-rose-600" onClick={() => removeAttachment(i)}>Remove</Button>
                        )}
                      </div>
                    ))
                  )}
                  {!locked && (
                    <Button size="sm" variant="outline" onClick={addMockAttachment}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add mock attachment
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Clinical actions */}
        <div>
          <Card className="lg:sticky lg:top-16">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Clinical actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" disabled={locked} onClick={() => setRxOpen(true)}>
                <Pill className="h-4 w-4 mr-2" /> Create prescription
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled={locked} onClick={() => setLabOpen(true)}>
                <LabIcon className="h-4 w-4 mr-2" /> Order laboratory test
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled={locked} onClick={() => setRefOpen(true)}>
                <Share2 className="h-4 w-4 mr-2" /> Create referral
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled={locked} onClick={() => toast.success("Follow-up booked", { description: "A follow-up appointment slot has been reserved. The patient will be notified." })}>
                <CalendarClock className="h-4 w-4 mr-2" /> Book follow-up
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled={locked || !doc.patientInstructions} onClick={() => toast.success("Patient instructions sent", { description: "Instructions have been delivered to the patient's inbox." })}>
                <Send className="h-4 w-4 mr-2" /> Send patient instructions
              </Button>

              <Separator className="my-2" />

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium mb-2">Linked records</p>
                <div className="space-y-1 text-xs">
                  <p className="flex items-center justify-between">
                    <span>Prescriptions</span>
                    <Badge variant="secondary">{encounter.prescriptions?.length ?? 0}</Badge>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Lab requests</span>
                    <Badge variant="secondary">{encounter.labRequests?.length ?? 0}</Badge>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Referrals</span>
                    <Badge variant="secondary">{encounter.referrals?.length ?? 0}</Badge>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Diagnoses</span>
                    <Badge variant="secondary">{encounter.diagnoses?.length ?? 0}</Badge>
                  </p>
                </div>
              </div>

              <Separator className="my-2" />

              {locked ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
                  <Lock className="h-5 w-5 text-rose-600 mx-auto mb-1" />
                  <p className="text-xs font-medium text-rose-800">Record signed</p>
                  <p className="text-[10px] text-rose-600 mt-0.5">This clinical record is locked and cannot be modified.</p>
                </div>
              ) : (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={completing} onClick={complete}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {completing ? "Completing…" : "Complete consultation"}
                </Button>
              )}
              {!locked && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Validates required SOAP fields, locks the record, and notifies the patient.
                </p>
              )}

              <Separator className="my-2" />

              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">Consultation fee</p>
                <p className="font-medium">{encounter.appointment ? formatCurrency(encounter.appointment.price) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Patient-facing price · read only</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <PrescriptionDialog
        open={rxOpen}
        onOpenChange={setRxOpen}
        patient={patient}
        encounterId={encounter.id}
        providerId={providerId}
        onIssued={() => {
          setRxOpen(false);
          toast.success("Prescription issued.", { description: "The patient has been notified." });
          load();
        }}
      />
      <LabRequestDialog
        open={labOpen}
        onOpenChange={setLabOpen}
        patient={patient}
        encounterId={encounter.id}
        providerId={providerId}
        onCreated={() => {
          setLabOpen(false);
          toast.success("Laboratory request created.", { description: "The patient can now book a lab appointment." });
          load();
        }}
      />
      <ReferralDialog
        open={refOpen}
        onOpenChange={setRefOpen}
        patient={patient}
        encounterId={encounter.id}
        providerId={providerId}
        prefillDiagnosis={doc.diagnosis}
        onCreated={() => {
          setRefOpen(false);
          toast.success("Referral sent.", { description: "Record access grant created for the recipient." });
          load();
        }}
      />
    </div>
  );
}
