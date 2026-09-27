"use client";

import { useEffect, useRef, useState } from "react";
import { navigate } from "@/lib/nav";
import { pharmacyService, uploadedPrescriptionService } from "@/lib/services";
import type { Pharmacy, UploadedPrescription } from "@/types";
import { PageHeader, LoadingState, SectionCard, BottomActionBar } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileText, Building2, Stethoscope, Image as ImageIcon,
  CheckCircle2, X, AlertCircle, ArrowRight, ShieldCheck, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { usePatientContext } from "../use-patient-context";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

type Stage = "form" | "submitting" | "success";

export function PatientUploadPrescription() {
  const { profile } = usePatientContext();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [stage, setStage] = useState<Stage>("form");
  const [result, setResult] = useState<UploadedPrescription | null>(null);

  // Form fields
  const [prescriberName, setPrescriberName] = useState("");
  const [prescriberFacility, setPrescriberFacility] = useState("");
  const [notes, setNotes] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    pharmacyService.list().then((p) => { if (!cancelled) setPharmacies(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!profile) return <LoadingState label="Loading your profile…" />;

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload an image file (JPG, PNG or HEIC).");
      e.target.value = "";
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB.");
      e.target.value = "";
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => toast.error("Could not read this image. Try another.");
    reader.readAsDataURL(f);
  }

  function clearFile() {
    setFile(null);
    setPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!profile) return;
    if (!file || !preview) {
      toast.error("Please attach a photo of your prescription.");
      return;
    }
    setBusy(true);
    setStage("submitting");
    try {
      const uploaded = await uploadedPrescriptionService.upload({
        patientId: profile.id,
        prescriberName: prescriberName.trim() || undefined,
        prescriberFacility: prescriberFacility.trim() || undefined,
        notes: notes.trim() || undefined,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        dataUrl: preview,
        pharmacyId: pharmacyId || undefined,
      });
      setResult(uploaded);
      setStage("success");
      toast.success("Prescription uploaded");
    } catch (err) {
      setStage("form");
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "success" && result) {
    return <SuccessView upload={result} onUploadAnother={resetForm} />;
  }

  const canSubmit = !!file && !!preview && !busy;

  return (
    <div className="space-y-6 pb-32 lg:pb-0">
      <PageHeader
        title="Upload a prescription"
        description="Snap a photo of a paper prescription from an offline doctor and send it to a pharmacy."
        back
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* File upload */}
          <SectionCard title="Prescription image" icon={ImageIcon} description="JPG, PNG or HEIC — up to 8 MB">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFileChosen}
              className="sr-only"
              aria-label="Choose prescription image"
            />

            {!preview ? (
              <button
                type="button"
                onClick={pickFile}
                className="w-full rounded-2xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/60 hover:border-emerald-300 transition-colors py-10 px-4 flex flex-col items-center gap-3 tap-highlight-none"
              >
                <div className="rounded-full bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  <Camera className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Tap to take a photo or choose an image</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Make sure all text is clear and readable.</p>
                </div>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border bg-muted/30">
                  <img src={preview} alt="Prescription preview" className="w-full max-h-72 object-contain bg-white" />
                  <button
                    type="button"
                    onClick={clearFile}
                    className="absolute top-2 right-2 rounded-full bg-background/90 backdrop-blur p-1.5 shadow-soft hover:bg-background tap-highlight-none"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {file && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0">· {formatBytes(file.size)}</span>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={pickFile} className="w-full">
                  <Upload className="h-3.5 w-3.5" /> Replace image
                </Button>
              </div>
            )}
          </SectionCard>

          {/* Optional details */}
          <SectionCard title="Details (optional)" icon={FileText} description="Help the pharmacy verify your prescription faster.">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prescriberName" className="text-xs">Prescriber name</Label>
                <div className="relative">
                  <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="prescriberName"
                    value={prescriberName}
                    onChange={(e) => setPrescriberName(e.target.value)}
                    placeholder="Dr Tunde Adeyemi"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prescriberFacility" className="text-xs">Prescriber facility / clinic</Label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="prescriberFacility"
                    value={prescriberFacility}
                    onChange={(e) => setPrescriberFacility(e.target.value)}
                    placeholder="City Medical Centre, Lagos"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs">Notes to pharmacy</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any preferred brand, delivery time, or context the pharmacy should know."
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Send to pharmacy (optional)" icon={Building2} description="Skip to send to all pharmacies for review.">
            <Select value={pharmacyId} onValueChange={setPharmacyId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a pharmacy (or leave blank)" />
              </SelectTrigger>
              <SelectContent>
                {pharmacies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pharmacyId && (
              <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>The selected pharmacy will be notified to review and prepare your order.</span>
              </div>
            )}
          </SectionCard>

          <SectionCard title="How it works" icon={AlertCircle}>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Take a clear photo of your prescription.</li>
              <li>Optionally pick a pharmacy to send it to.</li>
              <li>Pharmacy reviews and accepts the order.</li>
              <li>Pay securely — medicines delivered to your door.</li>
            </ol>
          </SectionCard>
        </div>
      </div>

      {/* Mobile bottom action */}
      <BottomActionBar>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">
              {file ? "Ready to upload" : "Attach a photo to continue"}
            </p>
            <p className="text-sm font-semibold leading-tight truncate">
              {file ? file.name : "No image selected"}
            </p>
          </div>
          <Button disabled={!canSubmit} onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>
      </BottomActionBar>

      {/* Desktop submit */}
      <div className="hidden lg:flex lg:justify-end">
        <Button disabled={!canSubmit} onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
          <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload prescription"}
        </Button>
      </div>
    </div>
  );

  function resetForm() {
    setPrescriberName("");
    setPrescriberFacility("");
    setNotes("");
    setPharmacyId("");
    clearFile();
    setResult(null);
    setStage("form");
  }
}

function SuccessView({ upload, onUploadAnother }: { upload: UploadedPrescription; onUploadAnother: () => void }) {
  const selectedPharmacy = upload.pharmacyId;
  return (
    <div className="space-y-6 pb-32 lg:pb-0">
      <PageHeader
        title="Prescription uploaded"
        description="Your prescription has been received."
        back
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Upload summary" icon={CheckCircle2} className="border-emerald-200 bg-emerald-50/40">
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-semibold">Successfully uploaded</p>
              </div>
              <dl className="text-sm space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Upload number</dt>
                  <dd className="font-mono font-medium text-right">{upload.uploadNumber}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right"><StatusBadge status={upload.status} size="sm" /></dd>
                </div>
                {upload.prescriberName ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Prescriber</dt>
                    <dd className="font-medium text-right">{upload.prescriberName}</dd>
                  </div>
                ) : null}
                {upload.prescriberFacility ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Facility</dt>
                    <dd className="font-medium text-right">{upload.prescriberFacility}</dd>
                  </div>
                ) : null}
                {upload.notes ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd className="font-medium text-right whitespace-pre-wrap">{upload.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </SectionCard>

          {upload.dataUrl ? (
            <SectionCard title="Attached image" icon={ImageIcon}>
              <img src={upload.dataUrl} alt="Uploaded prescription" className="w-full rounded-xl border bg-white max-h-96 object-contain" />
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <SectionCard title="What happens next" icon={ArrowRight}>
            <ol className="text-sm text-muted-foreground space-y-2.5 list-decimal list-inside">
              <li>{selectedPharmacy ? "Your selected pharmacy will review the image." : "Pharmacies will see your upload in their queue."}</li>
              <li>Once accepted, you'll get a notification.</li>
              <li>Pay securely and arrange delivery.</li>
            </ol>
          </SectionCard>

          <SectionCard title="Quick actions" icon={FileText}>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate("patient", "uploads")}>
                <FileText className="h-4 w-4" /> View my uploads
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={onUploadAnother}>
                <Upload className="h-4 w-4" /> Upload another
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate("patient", "prescriptions")}>
                <FileText className="h-4 w-4" /> Back to prescriptions
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <BottomActionBar>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">Upload {upload.uploadNumber}</p>
            <p className="text-sm font-semibold leading-tight">Received</p>
          </div>
          <Button onClick={() => navigate("patient", "uploads")} className="bg-emerald-600 hover:bg-emerald-700">
            View uploads <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </BottomActionBar>
    </div>
  );
}
