"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicService } from "@royal-palace/contracts";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { publicDiscoveryService, productionLaboratoryService } from "@/lib/services";
import type { Patient } from "@/types";

interface LabRequestDialogProps {
  appointmentId: string;
  onCreated: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  patient: Patient | null;
}

const SAMPLE_TYPES = [
  "Venous blood",
  "Capillary blood",
  "Urine (mid-stream)",
  "Urine (24h)",
  "Stool",
  "Sputum",
  "Throat swab",
  "Tissue biopsy",
  "Other",
] as const;

function buildSpecimenInstructions(input: {
  fastingRequired: boolean;
  notes: string;
  preparationInstructions: string;
  sampleType: string;
}): string | undefined {
  const instructions = [
    `Specimen: ${input.sampleType}`,
    input.fastingRequired ? "Fasting required." : undefined,
    input.preparationInstructions.trim() || undefined,
    input.notes.trim() ? `Laboratory note: ${input.notes.trim()}` : undefined,
  ].filter((value): value is string => value !== undefined);
  return instructions.length > 0 ? instructions.join("\n") : undefined;
}

export function LabRequestDialog({
  appointmentId,
  onCreated,
  onOpenChange,
  open,
  patient,
}: LabRequestDialogProps) {
  const [services, setServices] = useState<readonly PublicService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT">("ROUTINE");
  const [preparationInstructions, setPreparationInstructions] = useState("");
  const [fastingRequired, setFastingRequired] = useState(false);
  const [sampleType, setSampleType] = useState<string>(SAMPLE_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setServiceId("");
    setClinicalIndication("");
    setPriority("ROUTINE");
    setPreparationInstructions("");
    setFastingRequired(false);
    setSampleType(SAMPLE_TYPES[0]);
    setNotes("");
    setError(null);

    const controller = new AbortController();
    setLoadingServices(true);
    publicDiscoveryService
      .services("LABORATORY", controller.signal)
      .then((response) => setServices(response.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "Laboratory services could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingServices(false);
      });
    return () => controller.abort();
  }, [open]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [serviceId, services],
  );

  async function submit() {
    if (!patient || !serviceId || !clinicalIndication.trim()) {
      setError("Choose a test service and enter the clinical indication.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await productionLaboratoryService.provider.create({
        appointmentId,
        clinicalIndication: clinicalIndication.trim(),
        patientId: patient.id,
        priority,
        serviceId,
        specimenInstructions: buildSpecimenInstructions({
          fastingRequired,
          notes,
          preparationInstructions,
          sampleType,
        }),
      });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory request could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" /> Order laboratory test
          </DialogTitle>
          <DialogDescription>
            For {patient ? `${patient.firstName} ${patient.lastName}` : "patient"}. Tests use the
            controlled laboratory catalogue so the patient can find a compatible verified lab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Test service *</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={loadingServices}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    loadingServices ? "Loading controlled services…" : "Choose a service"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} ({service.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedService && (
              <p className="text-xs text-muted-foreground">
                Patients will only be offered verified laboratories that provide{" "}
                {selectedService.name}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lab-clinical-indication">Clinical indication *</Label>
            <Textarea
              id="lab-clinical-indication"
              rows={3}
              value={clinicalIndication}
              onChange={(event) => setClinicalIndication(event.target.value)}
              placeholder="Reason for ordering this test."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as typeof priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sample type</Label>
              <Select value={sampleType} onValueChange={setSampleType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLE_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lab-preparation">Preparation instructions</Label>
            <Textarea
              id="lab-preparation"
              rows={2}
              value={preparationInstructions}
              onChange={(event) => setPreparationInstructions(event.target.value)}
              placeholder="For example, fast for 10–12 hours before collection."
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Fasting required</Label>
              <p className="text-xs text-muted-foreground">
                The patient must fast before collection.
              </p>
            </div>
            <Switch checked={fastingRequired} onCheckedChange={setFastingRequired} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lab-notes">Notes for the laboratory</Label>
            <Textarea
              id="lab-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional specimen-handling note."
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || loadingServices || services.length === 0}
          >
            {submitting ? "Creating…" : "Create lab request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
