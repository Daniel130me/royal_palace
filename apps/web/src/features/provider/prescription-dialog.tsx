"use client";

import { useEffect, useState } from "react";
import { productionPrescriptionService, providerService } from "@/lib/services";
import { normalizeProvider } from "./normalize";
import type { Provider, Patient } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Trash2, Pill } from "lucide-react";

export interface PrescriptionItemDraft {
  medicine: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  refillAllowance: number;
  substitutionAllowed: boolean;
  instructions: string;
  controlledMedication: boolean;
  quantityUnit: string;
}

const DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Cream",
  "Ointment",
  "Drops",
  "Inhaler",
  "Suppository",
];
const ROUTES = [
  "Oral",
  "Topical",
  "Intravenous",
  "Intramuscular",
  "Subcutaneous",
  "Inhaled",
  "Ophthalmic",
  "Otic",
  "Nasal",
  "Rectal",
];
const FREQUENCIES = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "As needed",
  "Every 4 hours",
  "Every 6 hours",
  "Every 8 hours",
  "Every 12 hours",
  "At bedtime",
];

function emptyItem(): PrescriptionItemDraft {
  return {
    medicine: "",
    genericName: "",
    strength: "",
    dosageForm: "Tablet",
    dose: "",
    route: "Oral",
    frequency: "Once daily",
    duration: "",
    quantity: 0,
    refillAllowance: 0,
    substitutionAllowed: true,
    instructions: "",
    controlledMedication: false,
    quantityUnit: "",
  };
}

interface PrescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient | null;
  appointmentId: string;
  providerId: string;
  onIssued: () => void;
}

export function PrescriptionDialog({
  open,
  onOpenChange,
  patient,
  appointmentId,
  onIssued,
}: PrescriptionDialogProps) {
  const [items, setItems] = useState<PrescriptionItemDraft[]>([emptyItem()]);
  const [expiry, setExpiry] = useState(
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setItems([emptyItem()]);
      setNotes("");
      setJurisdictionCode("");
      setError(null);
    }
  }, [open]);

  const activeAllergies = patient?.allergies.filter((a) => a.status === "active") ?? [];

  function updateItem(idx: number, patch: Partial<PrescriptionItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function submit() {
    if (!patient) return;
    const valid = items.filter(
      (it) =>
        it.medicine.trim() &&
        it.strength.trim() &&
        it.dose.trim() &&
        it.duration.trim() &&
        it.quantity > 0 &&
        it.quantityUnit.trim(),
    );
    if (valid.length === 0) {
      setError(
        "Add at least one complete item (medicine, strength, dose, duration, quantity > 0).",
      );
      return;
    }
    if (!jurisdictionCode.trim()) {
      setError("Enter the jurisdiction governing this prescription.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const draft = await productionPrescriptionService.provider.createDraft({
        appointmentId,
        clinicalNote: notes || undefined,
        jurisdictionCode,
        patientId: patient.id,
        items: valid.map((it) => ({
          controlledMedication: it.controlledMedication,
          dose: it.dose,
          duration: it.duration,
          frequency: it.frequency,
          instructions: it.instructions || undefined,
          medicationName: it.medicine,
          quantity: String(it.quantity),
          quantityUnit: it.quantityUnit,
          refillsAuthorized: it.refillAllowance,
          route: it.route,
          strength: it.strength || undefined,
          substitutionAllowed: it.substitutionAllowed,
        })),
      });
      await productionPrescriptionService.provider.sign(
        draft.id,
        draft.version,
        new Date(`${expiry}T23:59:59.999Z`).toISOString(),
      );
      onIssued();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" /> Create prescription
          </DialogTitle>
          <DialogDescription>
            For {patient ? `${patient.firstName} ${patient.lastName}` : "patient"} · Appointment{" "}
            {appointmentId}
          </DialogDescription>
        </DialogHeader>

        {activeAllergies.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-bold text-rose-700 uppercase flex items-center gap-1 mb-1">
              <AlertCircle className="h-3.5 w-3.5" /> Allergy alert
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeAllergies.map((a, i) => (
                <Badge key={i} variant="outline" className="border-rose-300 bg-white text-rose-700">
                  {a.name}{" "}
                  <span className="text-[10px] text-rose-500 ml-1">
                    ({a.source.replace("_", " ")})
                  </span>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-rose-600 mt-2">
              Verify each medicine against the patient&apos;s allergy record before issuing.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {items.map((it, idx) => (
            <div key={idx} className="rounded-lg border p-3 space-y-3 relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Item {idx + 1}
                </p>
                {items.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-rose-600"
                    onClick={() => removeItem(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Medicine *</Label>
                  <Input
                    value={it.medicine}
                    onChange={(e) => updateItem(idx, { medicine: e.target.value })}
                    placeholder="e.g. Amlodipine"
                  />
                </div>
                <div>
                  <Label className="text-xs">Generic / Brand</Label>
                  <Input
                    value={it.genericName}
                    onChange={(e) => updateItem(idx, { genericName: e.target.value })}
                    placeholder="e.g. Norvasc"
                  />
                </div>
                <div>
                  <Label className="text-xs">Strength *</Label>
                  <Input
                    value={it.strength}
                    onChange={(e) => updateItem(idx, { strength: e.target.value })}
                    placeholder="e.g. 10mg"
                  />
                </div>
                <div>
                  <Label className="text-xs">Dosage form</Label>
                  <Select
                    value={it.dosageForm}
                    onValueChange={(v) => updateItem(idx, { dosageForm: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOSAGE_FORMS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dose *</Label>
                  <Input
                    value={it.dose}
                    onChange={(e) => updateItem(idx, { dose: e.target.value })}
                    placeholder="e.g. 1 tablet"
                  />
                </div>
                <div>
                  <Label className="text-xs">Route</Label>
                  <Select value={it.route} onValueChange={(v) => updateItem(idx, { route: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUTES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <Select
                    value={it.frequency}
                    onValueChange={(v) => updateItem(idx, { frequency: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Duration *</Label>
                  <Input
                    value={it.duration}
                    onChange={(e) => updateItem(idx, { duration: e.target.value })}
                    placeholder="e.g. 30 days"
                  />
                </div>
                <div>
                  <Label className="text-xs">Quantity *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={it.quantity || ""}
                    onChange={(e) =>
                      updateItem(idx, { quantity: parseInt(e.target.value, 10) || 0 })
                    }
                    placeholder="e.g. 30"
                  />
                </div>
                <div>
                  <Label className="text-xs">Quantity unit *</Label>
                  <Input
                    value={it.quantityUnit}
                    onChange={(e) => updateItem(idx, { quantityUnit: e.target.value })}
                    placeholder="e.g. tablets, mL"
                  />
                </div>
                <div>
                  <Label className="text-xs">Refill allowance</Label>
                  <Input
                    type="number"
                    min={0}
                    value={it.refillAllowance || ""}
                    onChange={(e) =>
                      updateItem(idx, { refillAllowance: parseInt(e.target.value, 10) || 0 })
                    }
                    placeholder="e.g. 2"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Instructions</Label>
                <Textarea
                  rows={2}
                  value={it.instructions}
                  onChange={(e) => updateItem(idx, { instructions: e.target.value })}
                  placeholder="Take in the morning with water. Avoid grapefruit."
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <Label className="text-xs">Allow generic substitution</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Pharmacist may dispense equivalent generic.
                  </p>
                </div>
                <Switch
                  checked={it.substitutionAllowed}
                  onCheckedChange={(v) => updateItem(idx, { substitutionAllowed: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-amber-200 p-2">
                <div>
                  <Label className="text-xs">Controlled medication</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Controlled prescribing remains disabled until jurisdiction qualification.
                  </p>
                </div>
                <Switch
                  checked={it.controlledMedication}
                  onCheckedChange={(v) => updateItem(idx, { controlledMedication: v })}
                />
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Add another item
          </Button>

          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t">
            <div>
              <Label className="text-xs">Expiry date</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Jurisdiction code *</Label>
            <Input
              value={jurisdictionCode}
              onChange={(event) => setJurisdictionCode(event.target.value.toUpperCase())}
              placeholder="Configured jurisdiction code"
            />
          </div>
          <div>
            <Label className="text-xs">Prescriber notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for the pharmacy or patient."
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? "Issuing…"
              : `Issue prescription (${items.filter((i) => i.medicine && i.strength && i.dose && i.duration && i.quantity > 0).length} item)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper hook for other dialogs that need the provider list
export function useProviders(excludeId?: string) {
  const [providers, setProviders] = useState<Provider[]>([]);
  useEffect(() => {
    providerService.list().then((ps) => {
      setProviders(ps.map(normalizeProvider).filter((p) => p.id !== excludeId));
    });
  }, [excludeId]);
  return providers;
}
