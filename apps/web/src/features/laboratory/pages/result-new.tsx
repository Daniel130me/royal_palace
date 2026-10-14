"use client";

import type {
  LaboratoryQueueRequestResponse,
  LaboratoryResultFlag,
  LaboratoryResultResponse,
} from "@royal-palace/contracts";
import { AlertTriangle, Check, FileCheck2, Paperclip, ShieldCheck, User, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  BottomActionBar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { navigate, useNav } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
]);
const ATTACHMENT_SCAN_POLL_MS = 1_500;
const ATTACHMENT_SCAN_MAX_POLLS = 40;

type ResultFlag = Lowercase<LaboratoryResultFlag>;

const INDICATOR_META: Record<
  ResultFlag,
  { chipBg: string; chipText: string; dot: string; label: string; ring: string }
> = {
  abnormal: {
    chipBg: "bg-amber-50",
    chipText: "text-amber-700",
    dot: "bg-amber-500",
    label: "Abnormal",
    ring: "ring-amber-200",
  },
  critical: {
    chipBg: "bg-rose-50",
    chipText: "text-rose-700",
    dot: "bg-rose-500",
    label: "Critical",
    ring: "ring-rose-200",
  },
  high: {
    chipBg: "bg-rose-50",
    chipText: "text-rose-700",
    dot: "bg-rose-500",
    label: "High",
    ring: "ring-rose-200",
  },
  low: {
    chipBg: "bg-amber-50",
    chipText: "text-amber-700",
    dot: "bg-amber-500",
    label: "Low",
    ring: "ring-amber-200",
  },
  normal: {
    chipBg: "bg-emerald-50",
    chipText: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Normal",
    ring: "ring-emerald-200",
  },
};

function bookingFrom(request: LaboratoryQueueRequestResponse, bookingId: string) {
  return request.bookings.find((booking) => booking.id === bookingId);
}

export function LabResultNew() {
  const { view } = useNav();
  const { labId } = useLabContext();
  const bookingId = view.params.bookingId;
  const [request, setRequest] = useState<LaboratoryQueueRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceRange, setReferenceRange] = useState("");
  const [flag, setFlag] = useState<ResultFlag>("normal");
  const [interpretation, setInterpretation] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!labId || !bookingId) {
      setError("The processing booking could not be identified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await productionLaboratoryService.laboratory.getBooking(labId, bookingId);
      const booking = bookingFrom(loaded, bookingId);
      if (!booking || booking.status !== "PROCESSING") {
        throw new Error("Results can be entered only while this booking is processing.");
      }
      setRequest(loaded);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The laboratory request could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseAttachment(file: File | undefined) {
    if (file === undefined) return;
    if (
      !ALLOWED_ATTACHMENT_TYPES.has(file.type) ||
      file.size < 1 ||
      file.size > MAX_ATTACHMENT_BYTES
    ) {
      toast.error("Choose a PDF, JPG, PNG, HEIC or HEIF report up to 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setAttachment(file);
  }

  async function waitForCleanAttachment(resultId: string, attachmentId: string) {
    if (!labId) return null;
    for (let poll = 0; poll < ATTACHMENT_SCAN_MAX_POLLS; poll += 1) {
      const result = await productionLaboratoryService.laboratory.result(labId, resultId);
      const status = result.attachments.find((item) => item.id === attachmentId)?.status;
      if (status === "CLEAN") return result;
      if (status === "REJECTED")
        throw new Error("The attached report did not pass security scanning.");
      await new Promise((resolve) => window.setTimeout(resolve, ATTACHMENT_SCAN_POLL_MS));
    }
    return null;
  }

  async function submit() {
    if (!labId || !bookingId || !request || submitting) return;
    if (!value.trim()) {
      toast.error("A result value is required.");
      return;
    }
    setSubmitting(true);
    try {
      let result: LaboratoryResultResponse =
        await productionLaboratoryService.laboratory.createResult(labId, {
          bookingId,
          components: [
            {
              flag: flag.toUpperCase() as LaboratoryResultFlag,
              name: request.service.name,
              referenceRange: referenceRange.trim() || undefined,
              unit: unit.trim() || undefined,
              value: value.trim(),
            },
          ],
          interpretation: interpretation.trim() || undefined,
        });

      if (attachment !== null) {
        const attachmentId = await productionLaboratoryService.laboratory.uploadResultAttachment(
          labId,
          result.id,
          attachment,
        );
        const scanned = await waitForCleanAttachment(result.id, attachmentId);
        if (scanned === null) {
          toast.success("Result saved. The report is still being scanned before publication.");
          navigate("laboratory", "results");
          return;
        }
        result = scanned;
      }

      const reviewed = await productionLaboratoryService.laboratory.transitionResultReview(
        labId,
        result.id,
        {
          expectedVersion: result.version,
          reasonCode: "submitted_for_review",
          toStatus: "IN_REVIEW",
        },
      );
      await productionLaboratoryService.laboratory.publishResult(
        labId,
        result.id,
        reviewed.version,
      );
      toast.success("Result published securely to the patient and referring practitioner.");
      navigate("laboratory", "results");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The result could not be published.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading request details…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!request || !bookingId) return <ErrorState message="Laboratory booking not found." />;

  const booking = bookingFrom(request, bookingId);
  if (!booking) return <ErrorState message="Laboratory booking not found." />;
  const indicator = INDICATOR_META[flag];

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <PageHeader
        back
        description={`For ${request.requestNumber} · ${request.service.name}`}
        title="Publish result"
      />

      <SectionCard icon={User} title="Patient & request">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ContextField label="Patient" value={request.patient.displayName} />
          <ContextField label="Request" value={request.requestNumber} />
          <ContextField
            label="Sample collected"
            value={
              booking.sampleCollectedAt ? new Date(booking.sampleCollectedAt).toLocaleString() : "—"
            }
          />
          <ContextField label="Priority" value={request.priority.toLowerCase()} />
          <ContextField label="Result date" value="Recorded automatically on publication" />
          <ContextField label="Reviewer" value="Authenticated laboratory account" />
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Collection, publication, and reviewer identity are recorded by the platform and cannot be
          backdated or typed as unverified claims.
        </p>
      </SectionCard>

      {flag === "critical" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-xs leading-relaxed text-rose-700">
            Publishing creates a timed critical-result acknowledgement for the ordering
            practitioner. External messages contain only a result reference, never the clinical
            value.
          </p>
        </div>
      )}

      <SectionCard icon={FileCheck2} title="Result details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Test</Label>
            <Input disabled value={request.service.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="result-unit">Unit</Label>
            <Input
              id="result-unit"
              maxLength={64}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="e.g. mmol/L, mg/dL, %"
              value={unit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="result-value">Value *</Label>
            <Input
              id="result-value"
              maxLength={1000}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Enter the reported value"
              value={value}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-range">Reference range</Label>
            <Input
              id="reference-range"
              maxLength={255}
              onChange={(event) => setReferenceRange(event.target.value)}
              placeholder="e.g. 3.5–5.0"
              value={referenceRange}
            />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label>Abnormal indicator</Label>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(INDICATOR_META) as ResultFlag[]).map((candidate) => {
              const meta = INDICATOR_META[candidate];
              const active = flag === candidate;
              return (
                <button
                  className={cn(
                    "tap-highlight-none inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    active
                      ? `${meta.chipBg} ${meta.chipText} border-current shadow-soft`
                      : "border-border bg-card text-muted-foreground hover:bg-accent",
                  )}
                  key={candidate}
                  onClick={() => setFlag(candidate)}
                  type="button"
                >
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  {meta.label}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
          <div
            className={cn(
              "rounded-lg p-2.5 text-xs leading-relaxed ring-1",
              indicator.chipBg,
              indicator.chipText,
              indicator.ring,
            )}
          >
            Preview: this result will be flagged as {indicator.label.toLowerCase()}.
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="interpretation">Interpretation</Label>
          <Textarea
            id="interpretation"
            maxLength={4000}
            onChange={(event) => setInterpretation(event.target.value)}
            placeholder="Clinical interpretation and recommended next steps…"
            rows={3}
            value={interpretation}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label>Report attachment</Label>
          {attachment ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{attachment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(attachment.size / 1024).toFixed(1)} KB · {attachment.type}
                  </p>
                </div>
              </div>
              <Button onClick={() => setAttachment(null)} size="sm" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Paperclip className="h-4 w-4" /> Attach report
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            PDF, JPG, PNG, HEIC or HEIF · up to 10 MB · quarantined and scanned before publication.
          </p>
          <input
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            aria-hidden="true"
            className="hidden"
            onChange={(event) => chooseAttachment(event.target.files?.[0])}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
        </div>

        <div className="mt-4 hidden items-center justify-between gap-2 border-t border-border/60 pt-4 lg:flex">
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            Publication completes the controlled result workflow and notifies the patient and
            ordering practitioner without exposing clinical details externally.
          </p>
          <ResultActions submitting={submitting} submit={() => void submit()} />
        </div>
      </SectionCard>

      <BottomActionBar>
        <ResultActions submitting={submitting} submit={() => void submit()} />
      </BottomActionBar>
    </div>
  );
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-medium capitalize">{value}</p>
    </div>
  );
}

function ResultActions({ submitting, submit }: { submitting: boolean; submit: () => void }) {
  return (
    <div className="flex w-full items-center gap-2 lg:w-auto">
      <Button
        disabled={submitting}
        onClick={() => navigate("laboratory", "bookings")}
        variant="outline"
      >
        Cancel
      </Button>
      <Button className="flex-1 lg:flex-none" disabled={submitting} onClick={submit}>
        <FileCheck2 className="h-4 w-4" /> {submitting ? "Securing result…" : "Publish result"}
      </Button>
    </div>
  );
}
