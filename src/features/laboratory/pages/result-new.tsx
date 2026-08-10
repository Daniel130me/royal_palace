"use client";

import { useEffect, useRef, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService } from "@/lib/services";
import type { LaboratoryRequest } from "@/types";
import { PageHeader } from "@/components/healthcare/page-header";
import { LoadingState, ErrorState } from "@/components/healthcare/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, FileCheck2, Paperclip, X, FlaskConical,
  User, AlertTriangle,
} from "lucide-react";

type AbnormalIndicator = "normal" | "high" | "low" | "critical";

interface FileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
}

const TEST_OPTIONS = [
  "Full Blood Count", "Lipid Profile", "Fasting Blood Sugar", "Blood Pressure Check",
  "Liver Function Test", "Renal Panel", "Thyroid Panel", "Urinalysis",
  "HbA1c", "Malaria Parasite", "COVID-19 PCR", "Typhoid (Widal)",
];

export function LabResultNew() {
  const { view } = useNav();
  const { labId, lab, reload } = useLabContext();
  const bookingId = view.params.bookingId;
  const requestId = view.params.requestId;

  const [request, setRequest] = useState<LaboratoryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [test, setTest] = useState("");
  const [sampleCollectionDate, setSampleCollectionDate] = useState(today);
  const [resultDate, setResultDate] = useState(today);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceRange, setReferenceRange] = useState("");
  const [abnormal, setAbnormal] = useState<AbnormalIndicator>("normal");
  const [interpretation, setInterpretation] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [attachment, setAttachment] = useState<FileMeta | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = () => {
    if (!requestId) {
      setError("No request id supplied.");
      setLoading(false);
      return;
    }
    setLoading(true);
    labRequestService
      .get(requestId)
      .then((r) => {
        setRequest(r);
        // Pre-fill test with first requested test if available.
        if (!test && r.tests[0]) setTest(r.tests[0]);
        if (!reviewer && lab) setReviewer(`${lab.name} — Lab Director`);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load request."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [requestId, lab]);

  const pickAttachment = () => {
    const el = fileInputRef.current;
    if (!el) return;
    el.value = ""; // reset so picking the same file twice still fires onchange
    el.onchange = () => {
      const f = el.files?.[0];
      if (!f) return;
      // We don't actually upload — we capture metadata only.
      setAttachment({
        id: `FILE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
      });
    };
    el.click();
  };

  const submit = async () => {
    if (!labId || !request) {
      toast.error("Missing laboratory profile or request.");
      return;
    }
    if (!test || !value) {
      toast.error("Test and value are required.");
      return;
    }
    setSubmitting(true);
    try {
      await labRequestService.publishResult({
        requestId: request.id,
        bookingId: bookingId ?? request.booking?.id ?? null,
        laboratoryId: labId,
        test,
        sampleCollectionDate,
        resultDate,
        value,
        unit: unit || null,
        referenceRange: referenceRange || null,
        abnormalIndicator: abnormal,
        interpretation: interpretation || null,
        reviewer: reviewer || null,
        actorId: labId,
      });
      toast.success("Result published — patient and referring provider notified.");
      reload();
      navigate("laboratory", "results");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to publish result.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading request details…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!request) return <ErrorState message="Request not found." />;

  return (
    <div>
      <PageHeader
        title="Publish laboratory result"
        description={`For ${request.requestNumber} · ${request.tests.join(", ")}`}
        breadcrumbs={[
          { label: "Laboratory", onClick: () => navigate("laboratory", "dashboard") },
          { label: "Results", onClick: () => navigate("laboratory", "results") },
          { label: "New" },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to bookings
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — patient + request summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><User className="h-4 w-4" /> Patient</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {request.patient && (
                <>
                  <InfoRow label="Name" value={`${request.patient.firstName} ${request.patient.lastName}`} />
                  <InfoRow label="Patient number" value={request.patient.patientNumber} />
                  <InfoRow label="Phone" value={request.patient.phone} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><FlaskConical className="h-4 w-4" /> Request</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <InfoRow label="Request number" value={request.requestNumber} />
              <InfoRow label="Sample type" value={request.sampleType ?? "—"} />
              <InfoRow label="Priority" value={request.priority} />
              {request.clinicalIndication && <InfoRow label="Indication" value={request.clinicalIndication} />}
              {bookingId && <InfoRow label="Booking ID" value={bookingId} />}
            </CardContent>
          </Card>

          {abnormal === "critical" && (
            <Card className="border-rose-200 bg-rose-50/50">
              <CardContent className="p-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">
                  On publish, the patient and referring provider will receive a notification flagging this critical result.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main column — result form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><FileCheck2 className="h-4 w-4" /> Result details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Test *</Label>
                  <Select value={test} onValueChange={setTest}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pick a test" /></SelectTrigger>
                    <SelectContent>
                      {(TEST_OPTIONS.includes(test) ? [] : [test]).concat(TEST_OPTIONS).filter(Boolean).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-unit">Unit</Label>
                  <Input id="f-unit" placeholder="e.g. mmol/L, mg/dL, %" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-scd">Sample collection date</Label>
                  <Input id="f-scd" type="date" value={sampleCollectionDate} onChange={(e) => setSampleCollectionDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-rd">Result date</Label>
                  <Input id="f-rd" type="date" value={resultDate} onChange={(e) => setResultDate(e.target.value)} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-value">Value *</Label>
                  <Input id="f-value" placeholder="e.g. 6.2" value={value} onChange={(e) => setValue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-rr">Reference range</Label>
                  <Input id="f-rr" placeholder="e.g. < 5.0" value={referenceRange} onChange={(e) => setReferenceRange(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Abnormal indicator</Label>
                <Select value={abnormal} onValueChange={(v) => setAbnormal(v as AbnormalIndicator)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="f-int">Interpretation</Label>
                <Textarea
                  id="f-int"
                  placeholder="Clinical interpretation of the result, recommended next steps…"
                  rows={4}
                  value={interpretation}
                  onChange={(e) => setInterpretation(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="f-rev">Reviewer</Label>
                <Input id="f-rev" placeholder="e.g. Dr. Funmi Okafor (Lab Director)" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Report attachment</Label>
                {attachment ? (
                  <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB · {attachment.type || "file"}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setAttachment(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={pickAttachment}>
                    <Paperclip className="h-4 w-4 mr-1" /> Attach report (metadata only)
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Mock upload — stores file metadata only; no real file is uploaded in the prototype.</p>
                <input ref={fileInputRef} type="file" className="hidden" aria-hidden="true" tabIndex={-1} />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Publishing this result will mark the request as <span className="font-medium">completed</span> and notify the patient + referring doctor.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate("laboratory", "bookings")} disabled={submitting}>Cancel</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={submit}>
                    <FileCheck2 className="h-4 w-4 mr-1" /> Publish result
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
