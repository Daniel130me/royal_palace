"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { labRequestService, laboratoryService } from "@/lib/services";
import type { LaboratoryRequest, Laboratory } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FlaskConical, ChevronRight, ChevronDown, ChevronUp, Clock, Building2, Home,
  Lock, CalendarDays, AlertCircle, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatTime, fullName } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

function nextDays(count: number): { value: string; label: string; sub: string }[] {
  const out: { value: string; label: string; sub: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    out.push({
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      sub: i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }),
    });
  }
  return out;
}

const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

export function PatientLaboratory() {
  const { profile } = usePatientContext();
  const [requests, setRequests] = useState<LaboratoryRequest[]>([]);
  const [labs, setLabs] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingFor, setBookingFor] = useState<LaboratoryRequest | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    Promise.all([
      labRequestService.list({ patientId: profile.id }),
      laboratoryService.list(),
    ]).then(([reqs, l]) => {
      setRequests(reqs.sort((a, b) => {
        const ta = new Date(createdAt(b) ?? b.requestNumber).getTime();
        const tb = new Date(createdAt(a) ?? a.requestNumber).getTime();
        return ta - tb;
      }));
      setLabs(l);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load laboratory data"))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const sections = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending_booking");
    const upcoming = requests.filter((r) => r.status === "booked").map((r) => ({ req: r, booking: r.booking }));
    const inProgress = requests.filter((r) => ["sample_collected", "processing", "quality_review"].includes(r.status));
    const results = requests.filter((r) => r.status === "completed" && r.result);
    return { pending, upcoming, inProgress, results };
  }, [requests]);

  if (loading) return <LoadingState label="Loading laboratory…" />;
  if (error) return <EmptyState title="Could not load laboratory" description={error} />;

  return (
    <div>
      <PageHeader
        title="Laboratory"
        description="Book tests, track samples and view results."
      />

      <div className="space-y-6">
        {/* Pending requests */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" /> Pending test requests ({sections.pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending test requests. Your doctor can request tests during a consultation.</p>
            ) : sections.pending.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{r.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground">{r.requestNumber} · requested by {r.provider ? fullName(r.provider) : "Provider"}</p>
                    {r.fastingRequired && (
                      <Badge variant="outline" className="mt-1 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                        <AlertCircle className="h-3 w-3 mr-1" /> Fasting required
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setBookingFor(r)}>
                    Book test
                  </Button>
                </div>
                {r.preparationInstructions && (
                  <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">
                    {r.preparationInstructions}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming bookings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-sky-600" /> Upcoming bookings ({sections.upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming laboratory bookings.</p>
            ) : sections.upcoming.map(({ req, booking }) => (
              <div key={req.id} className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{req.tests.join(", ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking?.laboratory?.name ?? "Laboratory"} · {formatDate(booking?.date)} · {formatTime(booking?.time)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{booking?.collectionMode} collection</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* In progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-violet-600" /> Tests in progress ({sections.inProgress.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.inProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tests currently in progress.</p>
            ) : sections.inProgress.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{r.tests.join(", ")}</p>
                  <p className="text-xs text-muted-foreground">{r.requestNumber}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" /> Results ({sections.results.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results available yet.</p>
            ) : sections.results.map((r) => (
              <div key={r.id} className="rounded-lg border">
                <button
                  className="w-full p-3 flex items-center justify-between text-left"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <div>
                    <p className="font-medium text-sm">{r.result?.test}</p>
                    <p className="text-xs text-muted-foreground">{r.result?.laboratory?.name} · {formatDate(r.result?.resultDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.result?.abnormalIndicator && r.result.abnormalIndicator !== "normal" && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] capitalize">
                        {r.result.abnormalIndicator}
                      </Badge>
                    )}
                    {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {expanded === r.id && r.result && (
                  <div className="border-t p-3 space-y-2 text-sm">
                    <Row label="Value" value={`${r.result.value}${r.result.unit ? ` ${r.result.unit}` : ""}`} />
                    <Row label="Reference range" value={r.result.referenceRange ?? "—"} />
                    <Row label="Indicator" value={<span className="capitalize">{r.result.abnormalIndicator ?? "normal"}</span>} />
                    <Row label="Sample collected" value={formatDate(r.result.sampleCollectionDate)} />
                    <Row label="Result published" value={formatDate(r.result.resultDate)} />
                    <Row label="Reviewer" value={r.result.reviewer ?? "—"} />
                    {r.result.interpretation && (
                      <div className="rounded bg-muted/40 p-2 text-xs text-muted-foreground">{r.result.interpretation}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Booking modal */}
      <LabBookingDialog
        request={bookingFor}
        labs={labs}
        onClose={() => setBookingFor(null)}
        patientId={profile?.id ?? ""}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LabBookingDialog({
  request, labs, onClose, patientId,
}: {
  request: LaboratoryRequest | null; labs: Laboratory[]; onClose: () => void; patientId: string;
}) {
  const [labId, setLabId] = useState("");
  const [mode, setMode] = useState<"facility" | "home">("facility");
  const [homeAddress, setHomeAddress] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const days = nextDays(14);

  // Reset when opening for a new request
  useEffect(() => {
    if (request) {
      setLabId(labs[0]?.id ?? "");
      setMode("facility");
      setHomeAddress("");
      setDate("");
      setTime("");
    }
  }, [request?.id]);

  const price = 8000; // base price for booking (tests already paid for via prescription? Not for this prototype)

  async function confirm() {
    if (!request || !labId || !date || !time) {
      toast.error("Please complete all fields.");
      return;
    }
    if (mode === "home" && !homeAddress.trim()) {
      toast.error("Please enter your home collection address.");
      return;
    }
    setBusy(true);
    try {
      await (await import("@/lib/services")).labRequestService.book({
        requestId: request.id,
        laboratoryId: labId,
        collectionMode: mode,
        homeAddress: mode === "home" ? homeAddress : undefined,
        date,
        time,
        price,
        actorId: patientId,
      });
      toast.success("Lab test booked");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book laboratory test</DialogTitle>
          <DialogDescription>
            {request ? `${request.tests.join(", ")} · ${request.requestNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-xs">Choose laboratory</Label>
            <Select value={labId} onValueChange={setLabId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a lab" /></SelectTrigger>
              <SelectContent>
                {labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.city}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Collection mode</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setMode("facility")}
                className={`rounded-lg border p-3 text-left text-sm ${mode === "facility" ? "border-emerald-500 bg-emerald-50" : "border-border"}`}
              >
                <Building2 className="h-4 w-4 mb-1" />
                <p className="font-medium">Facility visit</p>
                <p className="text-xs text-muted-foreground">Visit the lab</p>
              </button>
              <button
                onClick={() => setMode("home")}
                className={`rounded-lg border p-3 text-left text-sm ${mode === "home" ? "border-emerald-500 bg-emerald-50" : "border-border"}`}
              >
                <Home className="h-4 w-4 mb-1" />
                <p className="font-medium">Home collection</p>
                <p className="text-xs text-muted-foreground">Sample collected at home</p>
              </button>
            </div>
          </div>

          {mode === "home" && (
            <div>
              <Label className="text-xs">Home address</Label>
              <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} placeholder="House number, street, area, city" />
            </div>
          )}

          <div>
            <Label className="text-xs">Date</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-1">
              {days.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDate(d.value)}
                  className={`rounded-lg border p-2 text-center text-xs ${date === d.value ? "border-emerald-500 bg-emerald-50" : "border-border"}`}
                >
                  <p className="text-[9px] text-muted-foreground uppercase">{d.sub}</p>
                  <p className="font-semibold">{d.label}</p>
                </button>
              ))}
            </div>
          </div>

          {date && (
            <div>
              <Label className="text-xs">Time slot</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {TIME_SLOTS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTime(t)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${time === t ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium" : "border-border"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Test booking fee</span><span>{formatCurrency(price)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span className="text-emerald-700">{formatCurrency(price)}</span></div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-[11px] text-amber-700 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Prototype — no real payment is processed.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={confirm}>
            {busy ? "Booking…" : `Pay ${formatCurrency(price)} & confirm`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
