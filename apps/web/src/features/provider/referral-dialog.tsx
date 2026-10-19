"use client";

import { useEffect, useState } from "react";
import { productionClinicalService, publicDiscoveryService } from "@/lib/services";
import type { Patient } from "@/types";
import type { PublicPractitionerSummary, PublicSpecialty } from "@royal-palace/contracts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Share2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReferralDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient | null;
  encounterId: string;
  providerId: string;
  prefillDiagnosis?: string;
  onCreated: () => void;
}

export function ReferralDialog({
  open,
  onOpenChange,
  patient,
  encounterId,
  providerId,
  prefillDiagnosis,
  onCreated,
}: ReferralDialogProps) {
  const [providers, setProviders] = useState<readonly PublicPractitionerSummary[]>([]);
  const [specialties, setSpecialties] = useState<readonly PublicSpecialty[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [reason, setReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [relevantHistory, setRelevantHistory] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [currentTreatment, setCurrentTreatment] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const controller = new AbortController();
      Promise.all([
        publicDiscoveryService.practitioners({ limit: 50 }, controller.signal),
        publicDiscoveryService.specialties(controller.signal),
      ])
        .then(([practitionerPage, specialtyPage]) => {
          setProviders(practitionerPage.data.filter((provider) => provider.id !== providerId));
          setSpecialties(specialtyPage.data);
        })
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setError(
              "Verified practitioners could not be loaded. You can still refer by specialty.",
            );
          }
        });
      setReason("");
      setSymptoms("");
      setRelevantHistory("");
      setDiagnosis(prefillDiagnosis ?? "");
      setCurrentTreatment("");
      setRequiredAction("");
      setUrgency("routine");
      setRecipientId("");
      setSpecialty("");
      setError(null);
    }
  }, [open, providerId, prefillDiagnosis]);

  function selectRecipient(id: string) {
    setRecipientId(id);
    const p = providers.find((x) => x.id === id);
    const primarySpecialty = p?.specialties[0];
    if (primarySpecialty) setSpecialty(primarySpecialty.code);
  }

  async function submit() {
    if (!patient) return;
    if (!reason.trim() || !specialty.trim()) {
      setError("Reason and recipient specialty are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const recipient = providers.find((provider) => provider.id === recipientId);
      const clinicalContext = [
        reason.trim(),
        symptoms.trim() ? `Symptoms: ${symptoms.trim()}` : "",
        relevantHistory.trim() ? `Relevant history: ${relevantHistory.trim()}` : "",
        diagnosis.trim() ? `Working diagnosis: ${diagnosis.trim()}` : "",
        currentTreatment.trim() ? `Current treatment: ${currentTreatment.trim()}` : "",
        requiredAction.trim() ? `Requested action: ${requiredAction.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await productionClinicalService.provider.relatedAction(encounterId, {
        kind: "REFERRAL",
        priority: urgency.toUpperCase() as "ROUTINE" | "URGENT" | "EMERGENCY",
        reason: clinicalContext,
        ...(recipient ? { recipientName: recipient.displayName } : {}),
        ...(recipient ? { recipientPractitionerId: recipient.id } : {}),
        specialtyCode: specialty.trim(),
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" /> Create referral
          </DialogTitle>
          <DialogDescription>
            Hand off care to a specialist. For{" "}
            {patient ? `${patient.firstName} ${patient.lastName}` : "patient"}.
          </DialogDescription>
        </DialogHeader>

        {activeAllergies.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            Patient allergies: {activeAllergies.map((a) => a.name).join(", ")}.
          </div>
        )}

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium">Receiving provider</Label>
              <Select value={recipientId} onValueChange={selectRecipient}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a provider (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName}
                      {p.specialties[0] ? ` · ${p.specialties[0].name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave blank for an open referral by specialty.
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Recipient specialty</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a specialty" />
                </SelectTrigger>
                <SelectContent>
                  {specialties.map((item) => (
                    <SelectItem key={item.id} value={item.code}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Reason for referral *</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain why you are referring the patient."
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Presenting symptoms</Label>
            <Textarea
              rows={2}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="Current symptoms and duration."
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Relevant medical history</Label>
            <Textarea
              rows={2}
              value={relevantHistory}
              onChange={(e) => setRelevantHistory(e.target.value)}
              placeholder="Past conditions, hospitalisations, family history."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium">Working diagnosis</Label>
              <Input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Essential hypertension (I10)"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Urgency</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Current treatment</Label>
            <Textarea
              rows={2}
              value={currentTreatment}
              onChange={(e) => setCurrentTreatment(e.target.value)}
              placeholder="Medications, doses, recent interventions."
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Required action from specialist</Label>
            <Textarea
              rows={2}
              value={requiredAction}
              onChange={(e) => setRequiredAction(e.target.value)}
              placeholder="e.g. Echocardiogram and cardiology opinion within 2 weeks."
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
            {submitting ? "Creating…" : "Send referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

void Badge;
