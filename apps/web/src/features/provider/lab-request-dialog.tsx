"use client";

import { useEffect, useState } from "react";
import { labRequestService } from "@/lib/services";
import type { Patient } from "@/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FlaskConical, X } from "lucide-react";

interface LabRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient | null;
  encounterId: string;
  providerId: string;
  onCreated: () => void;
}

const SAMPLE_TYPES = ["Venous blood", "Capillary blood", "Urine (mid-stream)", "Urine (24h)", "Stool", "Sputum", "Throat swab", "Tissue biopsy", "Other"];

export function LabRequestDialog({ open, onOpenChange, patient, encounterId, providerId, onCreated }: LabRequestDialogProps) {
  const [tests, setTests] = useState<string[]>([""]);
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [priority, setPriority] = useState("routine");
  const [preparationInstructions, setPreparationInstructions] = useState("");
  const [fastingRequired, setFastingRequired] = useState(false);
  const [sampleType, setSampleType] = useState("Venous blood");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTests([""]);
      setClinicalIndication("");
      setPriority("routine");
      setPreparationInstructions("");
      setFastingRequired(false);
      setSampleType("Venous blood");
      setNotes("");
      setError(null);
    }
  }, [open]);

  function updateTest(idx: number, v: string) {
    setTests((prev) => prev.map((t, i) => (i === idx ? v : t)));
  }
  function addTest() { setTests((prev) => [...prev, ""]); }
  function removeTest(idx: number) {
    setTests((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function submit() {
    if (!patient) return;
    const validTests = tests.map((t) => t.trim()).filter(Boolean);
    if (validTests.length === 0) {
      setError("Add at least one test name.");
      return;
    }
    if (!clinicalIndication.trim()) {
      setError("Clinical indication is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await labRequestService.create({
        encounterId,
        patientId: patient.id,
        requestingProviderId: providerId,
        tests: validTests,
        clinicalIndication,
        priority,
        preparationInstructions: preparationInstructions || undefined,
        fastingRequired,
        sampleType,
        notes: notes || undefined,
        actorId: providerId,
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const activeAllergies = patient?.allergies.filter((a) => a.status === "active") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Order laboratory test</DialogTitle>
          <DialogDescription>
            For {patient ? `${patient.firstName} ${patient.lastName}` : "patient"} · Encounter {encounterId}
          </DialogDescription>
        </DialogHeader>

        {activeAllergies.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            <strong>Note:</strong> patient allergies: {activeAllergies.map((a) => a.name).join(", ")}. Some tests may require alternative sample handling.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Tests *</Label>
            <p className="text-xs text-muted-foreground mb-2">Add each test on its own line.</p>
            <div className="space-y-2">
              {tests.map((t, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={t}
                    onChange={(e) => updateTest(idx, e.target.value)}
                    placeholder={`e.g. ${idx === 0 ? "Full Blood Count" : idx === 1 ? "Lipid Profile" : "Fasting Blood Glucose"}`}
                  />
                  {tests.length > 1 && (
                    <Button size="icon" variant="ghost" className="shrink-0 text-rose-600" onClick={() => removeTest(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addTest}>
              <Plus className="h-4 w-4 mr-1" /> Add test
            </Button>
          </div>

          <div>
            <Label className="text-xs font-medium">Clinical indication *</Label>
            <Textarea rows={3} value={clinicalIndication} onChange={(e) => setClinicalIndication(e.target.value)} placeholder="Reason for ordering these tests." />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT (immediate)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Sample type</Label>
              <Select value={sampleType} onValueChange={setSampleType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SAMPLE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Preparation instructions</Label>
            <Textarea rows={2} value={preparationInstructions} onChange={(e) => setPreparationInstructions(e.target.value)} placeholder="e.g. Fast for 10-12 hours before sample collection." />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-xs font-medium">Fasting required</Label>
              <p className="text-xs text-muted-foreground">Patient must fast before sample collection.</p>
            </div>
            <Switch checked={fastingRequired} onCheckedChange={setFastingRequired} />
          </div>

          <div>
            <Label className="text-xs font-medium">Notes for the laboratory</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional handling notes." />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create lab request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// suppress unused import warning for Badge/Trash2 if not used
void Badge;
void Trash2;
