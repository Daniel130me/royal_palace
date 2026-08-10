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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  BottomActionBar,
  LoadingState,
  ErrorState,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  User, AlertCircle, Activity, Pill, FlaskConical,
  CalendarClock, Stethoscope, Save, Lock, CheckCircle2, Send, Share2,
  FlaskConical as LabIcon, FileText, Plus, ShieldCheck,
  ClipboardList, Stethoscope as StethoscopeIcon, HeartPulse, ListChecks,
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

type DocWithCode = EncounterDocumentation & { diagnosisCode?: string };

type MobileTab = "patient" | "notes" | "actions";

function SoapField({ label, value, onChange, disabled, placeholder, required, error }: {
  label: string; value: string | undefined; onChange: (v: string) => void; disabled: boolean; placeholder?: string; required?: boolean; error?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <Textarea
        rows={2}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error || undefined}
        className={`mt-1 ${error ? "ring-2 ring-rose-400/60 border-rose-300" : ""}`}
      />
      {error && <p className="mt-1 text-[11px] text-rose-600">This field is required.</p>}
    </div>
  );
}

/** Autosave status chip — shared between mobile Notes header and desktop panel. */
function AutosaveChip({ state }: { state: "idle" | "saving" | "saved" }) {
  return (
    <Badge
      variant="outline"
      className={`h-6 ${
        state === "saving"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : state === "saved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : ""
      }`}
    >
      {state === "saving" ? (<><Save className="h-3 w-3 mr-1 animate-pulse" /> Saving…</>) :
       state === "saved" ? (<><CheckCircle2 className="h-3 w-3 mr-1" /> Saved</>) :
       (<><Save className="h-3 w-3 mr-1" /> Autosave on</>)}
    </Badge>
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("patient");

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
    const missing = REQUIRED_FIELDS
      .filter((f) => !doc[f.key] || String(doc[f.key]).trim() === "")
      .map((f) => f.key as string);
    if (missing.length > 0) {
      setMissingFields(missing);
      toast.error(`Cannot complete: ${missing.length} required field(s) missing.`);
      setMobileTab("notes");
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

  const isMissing = (key: keyof EncounterDocumentation) => missingFields.includes(key as string);

  if (loading) return <LoadingState label="Loading encounter workspace…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!encounter) return <ErrorState message="Encounter not found." />;
  if (!patient) return <ErrorState message="Patient record missing." />;

  const sharedPanelProps = {
    patient,
    recentEncounters,
    recentLabs,
    activeRx,
    doc,
    update,
    updateVital,
    diagnosisCode,
    setDiagnosisCode,
    locked,
    saving,
    missingFields,
    isMissing,
    attachments,
    addMockAttachment,
    removeAttachment,
    encounter,
    completing,
    complete,
    setRxOpen,
    setLabOpen,
    setRefOpen,
  };

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={`Encounter ${encounter.encounterNumber}`}
        description={`${patient.firstName} ${patient.lastName} · ${patient.patientNumber} · Started ${formatDate(encounter.createdAt)}`}
        back
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={encounter.status} />
            {locked ? (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-6">
                <Lock className="h-3 w-3 mr-1" /> Signed
              </Badge>
            ) : (
              <Badge className="hidden sm:inline-flex h-6 bg-primary/10 border border-primary/20 text-primary">
                <Stethoscope className="h-3 w-3 mr-1" /> Active
              </Badge>
            )}
          </div>
        }
      />

      {locked && (
        <Alert className="mb-5 border-emerald-200 bg-emerald-50">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800">Signed Clinical Record — This consultation is locked.</AlertTitle>
          <AlertDescription className="text-emerald-700">
            Signed on {encounter.signedAt ? formatDate(encounter.signedAt) : "—"} by {encounter.provider ? `${encounter.provider.title} ${encounter.provider.lastName}` : "the consulting provider"}. The documentation below is read-only.
          </AlertDescription>
        </Alert>
      )}

      {/* ===================== DESKTOP: 3-panel layout ===================== */}
      <div className="hidden lg:grid gap-5 lg:grid-cols-[280px_1fr_320px] lg:items-start">
        {/* LEFT: Patient summary */}
        <aside className="lg:sticky lg:top-20">
          <SectionCard title="Patient summary" icon={User} dense contentClassName="p-0">
            <PatientSummaryBody
              patient={patient}
              recentEncounters={recentEncounters}
              recentLabs={recentLabs}
              activeRx={activeRx}
            />
          </SectionCard>
        </aside>

        {/* CENTER: SOAP documentation */}
        <div className={locked ? "opacity-80" : ""}>
          <NotesPanel {...sharedPanelProps} />
        </div>

        {/* RIGHT: Clinical actions */}
        <aside className="lg:sticky lg:top-20">
          <ActionsPanel
            encounter={encounter}
            locked={locked}
            completing={completing}
            complete={complete}
            setRxOpen={setRxOpen}
            setLabOpen={setLabOpen}
            setRefOpen={setRefOpen}
            doc={doc}
            variant="sidebar"
          />
        </aside>
      </div>

      {/* ===================== MOBILE: SegmentedControl tabs ===================== */}
      <div className="lg:hidden space-y-4">
        <SegmentedControl
          value={mobileTab}
          onChange={(v) => setMobileTab(v as MobileTab)}
          options={[
            { value: "patient", label: "Patient", icon: User },
            { value: "notes", label: "Notes", icon: FileText },
            { value: "actions", label: "Actions", icon: Stethoscope },
          ]}
        />

        {mobileTab === "patient" && (
          <PatientSummaryBody
            patient={patient}
            recentEncounters={recentEncounters}
            recentLabs={recentLabs}
            activeRx={activeRx}
          />
        )}

        {mobileTab === "notes" && (
          <NotesPanel {...sharedPanelProps} />
        )}

        {mobileTab === "actions" && (
          <ActionsPanel
            encounter={encounter}
            locked={locked}
            completing={completing}
            complete={complete}
            setRxOpen={setRxOpen}
            setLabOpen={setLabOpen}
            setRefOpen={setRefOpen}
            doc={doc}
            variant="cards"
          />
        )}
      </div>

      {/* Mobile bottom action bar: Complete consultation (or signed banner if locked) */}
      <BottomActionBar>
        {locked ? (
          <div className="flex items-center gap-2 w-full">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="text-xs flex-1 min-w-0">
              <p className="font-semibold text-emerald-800">Signed clinical record</p>
              <p className="text-emerald-700 text-[10px] truncate">Read-only — consultation locked</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-semibold leading-tight">Complete consultation</p>
              {missingFields.length > 0 ? (
                <p className="text-rose-600 text-[10px] truncate">{missingFields.length} required field(s) missing</p>
              ) : (
                <p className="text-muted-foreground text-[10px] truncate">Validates & signs the record</p>
              )}
            </div>
            <Button size="sm" disabled={completing} onClick={complete} className="shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {completing ? "…" : "Complete"}
            </Button>
          </div>
        )}
      </BottomActionBar>

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

/* ===========================================================================
   NOTES PANEL — SOAP documentation.
   On desktop: rendered inside a SectionCard.
   On mobile: rendered as a stack of ExpandableCards (one per SOAP section).
   The `variant` is auto-detected from CSS — we render both layouts and toggle
   with `hidden lg:block` to avoid prop-drilling.
   ==========================================================================*/

interface NotesPanelProps {
  patient: Patient;
  recentEncounters: Appointment[];
  recentLabs: LaboratoryRequest[];
  activeRx: Prescription[];
  doc: EncounterDocumentation;
  update: <K extends keyof EncounterDocumentation>(key: K, value: EncounterDocumentation[K]) => void;
  updateVital: (key: string, value: string) => void;
  diagnosisCode: string;
  setDiagnosisCode: (v: string) => void;
  locked: boolean;
  saving: "idle" | "saving" | "saved";
  missingFields: string[];
  isMissing: (key: keyof EncounterDocumentation) => boolean;
  attachments: FileMeta[];
  addMockAttachment: () => void;
  removeAttachment: (idx: number) => void;
  encounter: ClinicalEncounter;
  completing: boolean;
  complete: () => void;
  setRxOpen: (v: boolean) => void;
  setLabOpen: (v: boolean) => void;
  setRefOpen: (v: boolean) => void;
}

function NotesPanel(props: NotesPanelProps) {
  const {
    doc, update, updateVital, diagnosisCode, setDiagnosisCode,
    locked, saving, missingFields, isMissing,
    attachments, addMockAttachment, removeAttachment,
  } = props;

  // Render the inner SOAP content once.
  const soapContent = (
    <>
      {missingFields.length > 0 && (
        <Alert className="border-rose-200 bg-rose-50">
          <AlertCircle className="h-4 w-4 text-rose-600" />
          <AlertTitle className="text-rose-800">Required fields missing</AlertTitle>
          <AlertDescription className="text-rose-700">
            <ul className="list-disc ml-4 text-xs space-y-0.5">
              {missingFields.map((m) => {
                const f = REQUIRED_FIELDS.find((r) => r.key === m);
                return <li key={m}>{f?.label ?? m}</li>;
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Subjective */}
      <div className="space-y-3">
        <SoapField label="Consultation Reason" required error={isMissing("consultationReason")} value={doc.consultationReason} onChange={(v) => update("consultationReason", v)} disabled={locked} placeholder="Why the patient is being seen today." />
        <SoapField label="Chief Complaint" value={doc.chiefComplaint} onChange={(v) => update("chiefComplaint", v)} disabled={locked} placeholder="In the patient's own words." />
        <SoapField label="History of Present Illness" value={doc.historyPresentIllness} onChange={(v) => update("historyPresentIllness", v)} disabled={locked} placeholder="Onset, course, severity, modifying factors." />
        <SoapField label="Relevant Medical History" required error={isMissing("relevantMedicalHistory")} value={doc.relevantMedicalHistory} onChange={(v) => update("relevantMedicalHistory", v)} disabled={locked} placeholder="Past conditions, hospitalisations, surgeries." />
        <SoapField label="Medication History" required error={isMissing("medicationHistory")} value={doc.medicationHistory} onChange={(v) => update("medicationHistory", v)} disabled={locked} placeholder="Current and recent medications, adherence." />
        <SoapField label="Allergy Confirmation" required error={isMissing("allergyConfirmation")} value={doc.allergyConfirmation} onChange={(v) => update("allergyConfirmation", v)} disabled={locked} placeholder="Confirm allergies reviewed with patient (or 'No known allergies')." />
        <div className="grid gap-3 sm:grid-cols-2">
          <SoapField label="Family History" value={doc.familyHistory} onChange={(v) => update("familyHistory", v)} disabled={locked} placeholder="Hereditary conditions." />
          <SoapField label="Social History" value={doc.socialHistory} onChange={(v) => update("socialHistory", v)} disabled={locked} placeholder="Occupation, smoking, alcohol, lifestyle." />
        </div>
      </div>
    </>
  );

  const objectiveContent = (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Vital Signs</Label>
        <div className="grid gap-3 sm:grid-cols-3 mt-1.5">
          {VITAL_KEYS.map((v) => (
            <div key={v.key}>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{v.label}</Label>
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
    </div>
  );

  const assessmentContent = (
    <div className="space-y-3">
      <SoapField label="Assessment" required error={isMissing("assessment")} value={doc.assessment} onChange={(v) => update("assessment", v)} disabled={locked} placeholder="Clinical impression and reasoning." />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">
            Diagnosis <span className="text-rose-500">*</span>
          </Label>
          <Input
            value={doc.diagnosis ?? ""}
            onChange={(e) => update("diagnosis", e.target.value)}
            disabled={locked}
            placeholder="e.g. Essential hypertension"
            aria-invalid={isMissing("diagnosis") || undefined}
            className={`mt-1 ${isMissing("diagnosis") ? "ring-2 ring-rose-400/60 border-rose-300" : ""}`}
          />
          {isMissing("diagnosis") && <p className="mt-1 text-[11px] text-rose-600">This field is required.</p>}
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Provisional code</Label>
          <Input value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)} disabled={locked} placeholder="e.g. I10 (ICD-10)" className="mt-1" />
        </div>
      </div>
      <SoapField label="Differential Diagnosis" value={doc.differentialDiagnosis} onChange={(v) => update("differentialDiagnosis", v)} disabled={locked} placeholder="Alternative diagnoses considered." />
    </div>
  );

  const planContent = (
    <div className="space-y-3">
      <SoapField label="Treatment Plan" required error={isMissing("treatmentPlan")} value={doc.treatmentPlan} onChange={(v) => update("treatmentPlan", v)} disabled={locked} placeholder="Investigations, medications, interventions." />
      <SoapField label="Patient Instructions" value={doc.patientInstructions} onChange={(v) => update("patientInstructions", v)} disabled={locked} placeholder="Lifestyle, dosing, expected course." />
      <SoapField label="Safety-Netting" value={doc.safetyNetting} onChange={(v) => update("safetyNetting", v)} disabled={locked} placeholder="Red flags — when to return urgently." />
    </div>
  );

  const followUpContent = (
    <div className="space-y-3">
      <SoapField label="Follow-Up" required error={isMissing("followUp")} value={doc.followUp} onChange={(v) => update("followUp", v)} disabled={locked} placeholder="When to review, what to monitor." />
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Attachments</Label>
        <div className="mt-2 space-y-2">
          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attachments.</p>
          ) : (
            attachments.map((f, i) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-2.5">
                <div className="text-xs min-w-0">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground ml-2">{Math.round(f.size / 1024)} KB · {relativeDay(f.uploadedAt)}</span>
                </div>
                {!locked && (
                  <Button size="sm" variant="ghost" className="h-7 text-rose-600 hover:text-rose-700" onClick={() => removeAttachment(i)}>Remove</Button>
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
    </div>
  );

  return (
    <>
      {/* DESKTOP — SectionCard with all SOAP fields laid out vertically */}
      <div className="hidden lg:block">
        <SectionCard
          title="Clinical documentation"
          description="SOAP notes — autosaved as you type"
          icon={FileText}
          action={!locked && <AutosaveChip state={saving} />}
        >
          <div className={locked ? "opacity-90 space-y-4" : "space-y-4"}>
            {soapContent}
            <Separator />
            {objectiveContent}
            <Separator />
            {assessmentContent}
            <Separator />
            {planContent}
            <Separator />
            {followUpContent}
          </div>
        </SectionCard>
      </div>

      {/* MOBILE — autosave chip + ExpandableCards per SOAP section */}
      <div className="lg:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">Clinical documentation</p>
              <p className="text-[11px] text-muted-foreground truncate">SOAP notes · autosaved</p>
            </div>
          </div>
          {!locked && <AutosaveChip state={saving} />}
        </div>

        {missingFields.length > 0 && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertTitle className="text-rose-800">{missingFields.length} required field(s) missing</AlertTitle>
            <AlertDescription className="text-rose-700">
              <ul className="list-disc ml-4 text-xs space-y-0.5">
                {missingFields.map((m) => {
                  const f = REQUIRED_FIELDS.find((r) => r.key === m);
                  return <li key={m}>{f?.label ?? m}</li>;
                })}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <ExpandableCard
          title="Subjective"
          subtitle="Reason · HPI · history · allergies"
          leading={<div className="rounded-lg bg-sky-50 p-2"><ClipboardList className="h-4 w-4 text-sky-600" /></div>}
          trailing={missingFields.some((m) => ["consultationReason", "relevantMedicalHistory", "medicationHistory", "allergyConfirmation"].includes(m)) ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">!</Badge> : undefined}
          defaultOpen
        >
          <div className="space-y-3">{soapContent}</div>
        </ExpandableCard>

        <ExpandableCard
          title="Objective"
          subtitle="Vitals · examination"
          leading={<div className="rounded-lg bg-emerald-50 p-2"><HeartPulse className="h-4 w-4 text-emerald-600" /></div>}
        >
          {objectiveContent}
        </ExpandableCard>

        <ExpandableCard
          title="Assessment"
          subtitle="Impression · diagnosis"
          leading={<div className="rounded-lg bg-violet-50 p-2"><StethoscopeIcon className="h-4 w-4 text-violet-600" /></div>}
          trailing={missingFields.includes("diagnosis") || missingFields.includes("assessment") ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">!</Badge> : undefined}
        >
          {assessmentContent}
        </ExpandableCard>

        <ExpandableCard
          title="Plan"
          subtitle="Treatment · instructions · safety-netting"
          leading={<div className="rounded-lg bg-amber-50 p-2"><ListChecks className="h-4 w-4 text-amber-600" /></div>}
          trailing={missingFields.includes("treatmentPlan") ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">!</Badge> : undefined}
        >
          {planContent}
        </ExpandableCard>

        <ExpandableCard
          title="Follow-up & Attachments"
          subtitle="Review plan · files"
          leading={<div className="rounded-lg bg-primary/10 p-2"><CalendarClock className="h-4 w-4 text-primary" /></div>}
          trailing={missingFields.includes("followUp") ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">!</Badge> : undefined}
        >
          {followUpContent}
        </ExpandableCard>
      </div>
    </>
  );
}

/* ===========================================================================
   ACTIONS PANEL — clinical actions list.
   Desktop sidebar variant = vertical button stack.
   Mobile cards variant = large tappable cards.
   ==========================================================================*/

interface ActionsPanelProps {
  encounter: ClinicalEncounter;
  locked: boolean;
  completing: boolean;
  complete: () => void;
  setRxOpen: (v: boolean) => void;
  setLabOpen: (v: boolean) => void;
  setRefOpen: (v: boolean) => void;
  doc: EncounterDocumentation;
  variant: "sidebar" | "cards";
}

const ACTION_TONES = {
  rx: "bg-violet-50 text-violet-600 ring-violet-100",
  lab: "bg-sky-50 text-sky-600 ring-sky-100",
  ref: "bg-amber-50 text-amber-600 ring-amber-100",
  followup: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  send: "bg-primary/10 text-primary ring-primary/20",
  complete: "bg-primary text-primary-foreground",
};

function ActionsPanel({ encounter, locked, completing, complete, setRxOpen, setLabOpen, setRefOpen, doc, variant }: ActionsPanelProps) {
  // Desktop sidebar variant — preserved verbatim from the original layout
  if (variant === "sidebar") {
    return (
      <SectionCard title="Clinical actions" icon={Stethoscope}>
        <div className="space-y-2">
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

          <Separator className="my-3" />

          <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Linked records</p>
            <div className="space-y-1.5 text-xs">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Prescriptions</span>
                <Badge variant="secondary" className="h-5 text-[10px]">{encounter.prescriptions?.length ?? 0}</Badge>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Lab requests</span>
                <Badge variant="secondary" className="h-5 text-[10px]">{encounter.labRequests?.length ?? 0}</Badge>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Referrals</span>
                <Badge variant="secondary" className="h-5 text-[10px]">{encounter.referrals?.length ?? 0}</Badge>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Diagnoses</span>
                <Badge variant="secondary" className="h-5 text-[10px]">{encounter.diagnoses?.length ?? 0}</Badge>
              </p>
            </div>
          </div>

          <Separator className="my-3" />

          {locked ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xs font-semibold text-emerald-800">Record signed</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">This clinical record is locked and cannot be modified.</p>
            </div>
          ) : (
            <Button className="w-full" size="lg" disabled={completing} onClick={complete}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {completing ? "Completing…" : "Complete consultation"}
            </Button>
          )}
          {!locked && (
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Validates required SOAP fields, locks the record, and notifies the patient.
            </p>
          )}

          <Separator className="my-3" />

          <div className="text-xs space-y-1">
            <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Consultation fee</p>
            <p className="font-semibold text-base text-foreground">{encounter.appointment ? formatCurrency(encounter.appointment.price) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">Patient-facing price · read only</p>
          </div>
        </div>
      </SectionCard>
    );
  }

  // Mobile cards variant — large tappable cards
  const actions = [
    {
      label: "Create prescription",
      sub: "Issue medications with dosing",
      icon: Pill,
      tone: ACTION_TONES.rx,
      disabled: locked,
      onClick: () => setRxOpen(true),
    },
    {
      label: "Order lab test",
      sub: "Request diagnostics for the patient",
      icon: LabIcon,
      tone: ACTION_TONES.lab,
      disabled: locked,
      onClick: () => setLabOpen(true),
    },
    {
      label: "Create referral",
      sub: "Hand off care to another provider",
      icon: Share2,
      tone: ACTION_TONES.ref,
      disabled: locked,
      onClick: () => setRefOpen(true),
    },
    {
      label: "Book follow-up",
      sub: "Reserve a review appointment slot",
      icon: CalendarClock,
      tone: ACTION_TONES.followup,
      disabled: locked,
      onClick: () => toast.success("Follow-up booked", { description: "A follow-up appointment slot has been reserved." }),
    },
    {
      label: "Send patient instructions",
      sub: "Deliver instructions to patient inbox",
      icon: Send,
      tone: ACTION_TONES.send,
      disabled: locked || !doc.patientInstructions,
      onClick: () => toast.success("Patient instructions sent", { description: "Instructions have been delivered to the patient's inbox." }),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Linked records compact summary */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Rx", value: encounter.prescriptions?.length ?? 0 },
          { label: "Labs", value: encounter.labRequests?.length ?? 0 },
          { label: "Refs", value: encounter.referrals?.length ?? 0 },
          { label: "Dx", value: encounter.diagnoses?.length ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium leading-none">{s.label}</p>
            <p className="text-base font-bold tabular-nums leading-none mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            onClick={a.onClick}
            disabled={a.disabled}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-all hover:shadow-soft hover:border-border disabled:opacity-50 disabled:cursor-not-allowed tap-highlight-none active:scale-[0.99]"
          >
            <div className={`rounded-xl p-2.5 ring-1 shrink-0 ${a.tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{a.label}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{a.sub}</p>
            </div>
            {!a.disabled && (
              <div className="rounded-full bg-muted p-1 shrink-0">
                <ChevronRightSmall />
              </div>
            )}
          </button>
        );
      })}

      {/* Consultation fee */}
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold leading-none">Consultation fee</p>
            <p className="font-bold text-base mt-1">{encounter.appointment ? formatCurrency(encounter.appointment.price) : "—"}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Patient-facing · read only</p>
        </div>
      </div>

      {locked && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <ShieldCheck className="h-7 w-7 text-emerald-600 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-emerald-800">Record signed</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">This clinical record is locked and read-only.</p>
        </div>
      )}
    </div>
  );
}

function ChevronRightSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-muted-foreground">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ===========================================================================
   PATIENT SUMMARY BODY — shared between desktop sidebar and mobile Patient tab.
   Uses ExpandableCard sections so it's compact & collapsible.
   ==========================================================================*/

function PatientSummaryBody({
  patient,
  recentEncounters,
  recentLabs,
  activeRx,
}: {
  patient: Patient;
  recentEncounters: Appointment[];
  recentLabs: LaboratoryRequest[];
  activeRx: Prescription[];
}) {
  const activeAllergies = patient.allergies.filter((a) => a.status === "active");
  const activeConditions = patient.conditions.filter((c) => c.status === "active");

  return (
    <div>
      {/* Demographic header */}
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {patient.firstName[0]}{patient.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{patient.firstName} {patient.lastName}</p>
          <p className="text-xs text-muted-foreground truncate">{patient.patientNumber}</p>
          <p className="text-xs text-muted-foreground">{age(patient.dateOfBirth) ?? "—"}y · {patient.gender} · {patient.bloodGroup ?? "?"}</p>
        </div>
      </div>

      {/* Allergy banner — always visible */}
      {activeAllergies.length > 0 ? (
        <div className="p-3 border-b border-rose-200 bg-rose-50">
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Allergy alert
          </p>
          <div className="space-y-1.5">
            {activeAllergies.map((a, i) => (
              <div key={i} className="text-xs flex items-start gap-1.5">
                <span className="font-semibold text-rose-800">{a.name}</span>
                <span className="text-rose-500 text-[10px] uppercase tracking-wider">{a.source.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 border-b border-border/60 bg-emerald-50/40">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> No known active allergies
          </p>
        </div>
      )}

      {/* Collapsible sections — ExpandableCard style */}
      <div className="divide-y divide-border/60">
        <ExpandableCard
          title="Active conditions"
          subtitle={`${activeConditions.length} active`}
          leading={<div className="rounded-lg bg-emerald-50 p-1.5"><Activity className="h-4 w-4 text-emerald-600" /></div>}
          className="border-0 rounded-none"
          defaultOpen
        >
          {activeConditions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {activeConditions.map((c, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground ml-1 text-[10px] uppercase tracking-wider">· {c.source.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </ExpandableCard>

        <ExpandableCard
          title="Current medications"
          subtitle={`${patient.medications.length} on record`}
          leading={<div className="rounded-lg bg-violet-50 p-1.5"><Pill className="h-4 w-4 text-violet-600" /></div>}
          className="border-0 rounded-none"
        >
          {patient.medications.length === 0 ? (
            <p className="text-xs text-muted-foreground">None on record.</p>
          ) : (
            <ul className="space-y-1">
              {patient.medications.map((m, i) => (
                <li key={i} className="text-xs">{m.name}</li>
              ))}
            </ul>
          )}
        </ExpandableCard>

        <ExpandableCard
          title="Recent consultations"
          subtitle={`${recentEncounters.length} prior`}
          leading={<div className="rounded-lg bg-sky-50 p-1.5"><Stethoscope className="h-4 w-4 text-sky-600" /></div>}
          className="border-0 rounded-none"
        >
          {recentEncounters.length === 0 ? (
            <p className="text-xs text-muted-foreground">No prior encounters.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentEncounters.map((a) => (
                <li key={a.id} className="text-xs">
                  <button className="text-left w-full hover:underline tap-highlight-none" onClick={() => a.encounter && navigate("provider", "encounter", { id: a.encounter!.id })}>
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
        </ExpandableCard>

        <ExpandableCard
          title="Recent lab results"
          subtitle={`${recentLabs.length} available`}
          leading={<div className="rounded-lg bg-amber-50 p-1.5"><FlaskConical className="h-4 w-4 text-amber-600" /></div>}
          className="border-0 rounded-none"
        >
          {recentLabs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No results yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentLabs.map((l) => (
                <li key={l.id} className="text-xs">
                  <span className="font-medium">{l.result?.test}</span>
                  <span className="text-muted-foreground ml-1">{l.result?.value} {l.result?.unit}</span>
                  {l.result?.abnormalIndicator && l.result.abnormalIndicator !== "normal" && (
                    <Badge variant="outline" className="ml-1 text-[10px] border-rose-200 text-rose-700 h-5">{l.result.abnormalIndicator}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ExpandableCard>

        <ExpandableCard
          title="Active prescriptions"
          subtitle={`${activeRx.length} active`}
          leading={<div className="rounded-lg bg-primary/10 p-1.5"><Pill className="h-4 w-4 text-primary" /></div>}
          className="border-0 rounded-none"
        >
          {activeRx.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active prescriptions.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeRx.map((rx) => (
                <li key={rx.id} className="text-xs">
                  <span className="font-medium">{rx.prescriptionNumber}</span>
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Expires {formatDate(rx.expiryDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </ExpandableCard>
      </div>
    </div>
  );
}
