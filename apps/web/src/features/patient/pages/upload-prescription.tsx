"use client";

import type { components as PublicDiscoveryComponents } from "@royal-palace/api-client";
import { Camera, FileText, ShieldCheck, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BottomActionBar, PageHeader, SectionCard } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { navigate } from "@/lib/nav";
import { productionPrescriptionService, publicDiscoveryService } from "@/lib/services";

type Pharmacy = PublicDiscoveryComponents["schemas"]["PublicOrganizationSummary"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
]);

export function PatientUploadPrescription() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmacyId, setPharmacyId] = useState("unassigned");
  const [prescriberName, setPrescriberName] = useState("");
  const [prescriberFacility, setPrescriberFacility] = useState("");
  const [patientNote, setPatientNote] = useState("");
  const [busy, setBusy] = useState(false);
  const previewUrl = useMemo(
    () => (file?.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    const controller = new AbortController();
    publicDiscoveryService
      .pharmacies({ limit: 50 }, controller.signal)
      .then((page) => setPharmacies([...page.data]))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function chooseFile(selected: File | undefined) {
    if (selected === undefined) return;
    if (!ALLOWED_TYPES.has(selected.type) || selected.size < 1 || selected.size > MAX_FILE_BYTES) {
      toast.error("Choose a PDF, JPG, PNG, HEIC or HEIF file up to 8 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(selected);
  }

  async function submit() {
    if (file === null || busy) return;
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const intent = await productionPrescriptionService.patient.createScannedPrescriptionUpload({
        declaredContentType: file.type as
          "application/pdf" | "image/heic" | "image/heif" | "image/jpeg" | "image/png",
        declaredSha256: sha256,
        declaredSizeBytes: file.size,
        originalFilename: file.name,
        patientNote: patientNote.trim() || null,
        pharmacyOrganizationId: pharmacyId === "unassigned" ? null : pharmacyId,
        prescriberFacility: prescriberFacility.trim() || null,
        prescriberName: prescriberName.trim() || null,
      });
      const uploaded = await fetch(intent.upload.url, {
        body: file,
        headers: intent.upload.headers,
        method: "PUT",
      });
      if (!uploaded.ok) throw new Error("The private upload could not be completed");
      await productionPrescriptionService.patient.completeScannedPrescriptionUpload(
        intent.prescription.id,
      );
      toast.success("Prescription received securely and queued for scanning");
      navigate("patient", "uploads", { id: intent.prescription.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Prescription upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        back
        title="Upload a prescription"
        description="Send a clear copy of a paper prescription through our private scanning workflow."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Prescription document"
            icon={FileText}
            description="PDF, JPG, PNG, HEIC or HEIF · up to 8 MB"
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              capture="environment"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            {file === null ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/30 px-4 py-10 transition-colors hover:border-emerald-300 hover:bg-muted/60"
              >
                <span className="rounded-full bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  <Camera className="h-6 w-6 text-emerald-700" />
                </span>
                <span className="text-sm font-medium">Take a photo or choose a document</span>
                <span className="text-xs text-muted-foreground">
                  Make sure every edge and line is readable.
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Prescription preview"
                    className="max-h-72 w-full rounded-xl border bg-white object-contain"
                  />
                ) : null}
                <div className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <FileText className="h-4 w-4 text-emerald-700" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFile(null)}
                    aria-label="Remove document"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
          <SectionCard
            title="Prescription details"
            icon={FileText}
            description="Optional details help the assigned pharmacy identify the document."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prescriber name" value={prescriberName} onChange={setPrescriberName} />
              <Field
                label="Prescriber facility or clinic"
                value={prescriberFacility}
                onChange={setPrescriberFacility}
              />
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="patient-note">Note to the pharmacy</Label>
              <Textarea
                id="patient-note"
                maxLength={1000}
                rows={3}
                value={patientNote}
                onChange={(event) => setPatientNote(event.target.value)}
              />
            </div>
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard
            title="Route for review"
            icon={ShieldCheck}
            description="Only the pharmacy you select can be granted review access after malware scanning."
          >
            <Select value={pharmacyId} onValueChange={setPharmacyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Keep private for now</SelectItem>
                {pharmacies.map((pharmacy) => (
                  <SelectItem key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Files remain quarantined and unavailable until byte verification and malware scanning
              succeed.
            </p>
          </SectionCard>
        </div>
      </div>
      <BottomActionBar>
        <Button
          className="ml-auto bg-emerald-700 hover:bg-emerald-800"
          disabled={file === null || busy}
          onClick={submit}
        >
          <Upload className="h-4 w-4" /> {busy ? "Uploading securely…" : "Upload prescription"}
        </Button>
      </BottomActionBar>
      <div className="hidden justify-end lg:flex">
        <Button
          className="bg-emerald-700 hover:bg-emerald-800"
          disabled={file === null || busy}
          onClick={submit}
        >
          <Upload className="h-4 w-4" /> {busy ? "Uploading securely…" : "Upload prescription"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={200}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
