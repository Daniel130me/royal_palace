"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { labRequestService, laboratoryService } from "@/lib/services";
import type { LaboratoryRequest, Laboratory } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard, BottomActionBar } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FlaskConical, ChevronDown, ChevronUp, Clock, Building2, Home,
  Lock, CalendarDays, AlertCircle, FileText, Minus,
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
    let cancelled = false;
    setLoading(true);
    Promise.all([
      labRequestService.list({ patientId: profile.id }),
      laboratoryService.list(),
    ]).then(([reqs, l]) => {
      if (cancelled) return;
      setRequests(reqs.sort((a, b) => {
        const ta = new Date(createdAt(b) ?? b.requestNumber).getTime();
        const tb = new Date(createdAt(a) ?? a.requestNumber).getTime();
        return ta - tb;
      }));
      setLabs(l);
    }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load laboratory data"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    <div className="space-y-6">
      <PageHeader
        title="Laboratory"
        description="Book tests, track samples and view results."
      />

      <div className="space-y-6">
        {/* Pending requests — prominent */}
        {sections.pending.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-1">
            <SectionCard
              title={`Pending test requests (${sections.pending.length})`}
              icon={Clock}
            >
              <ul className="space-y-3">
                {sections.pending.map((r) => (
                  <li key={r.id} className="rounded-xl border border-amber-200/60 bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{r.tests.join(", ")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.requestNumber} · requested by {r.provider ? fullName(r.provider) : "Provider"}
                        </p>
                        {r.fastingRequired && (
                          <Badge variant="outline" className="mt-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px] h-5 px-1.5 gap-0.5">
                            <AlertCircle className="h-3 w-3" /> Fasting required
                          </Badge>
                        )}
                      </div>
                      <Button size="sm" onClick={() => setBookingFor(r)}>Book test</Button>
                    </div>
                    {r.preparationInstructions && (
                      <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">
                        {r.preparationInstructions}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        ) : (
          <SectionCard title="Pending test requests (0)" icon={Clock}>
            <p className="text-sm text-muted-foreground">No pending test requests. Your doctor can request tests during a consultation.</p>
          </SectionCard>
        )}

        {/* Upcoming bookings */}
        <SectionCard title={`Upcoming bookings (${sections.upcoming.length})`} icon={CalendarDays} dense>
          {sections.upcoming.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No upcoming laboratory bookings.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sections.upcoming.map(({ req, booking }) => (
                <li key={req.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{req.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {booking?.laboratory?.name ?? "Laboratory"} · {formatDate(booking?.date)} · {formatTime(booking?.time)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{booking?.collectionMode} collection</p>
                  </div>
                  <StatusBadge status={req.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* In progress */}
        <SectionCard title={`Tests in progress (${sections.inProgress.length})`} icon={FlaskConical} dense>
          {sections.inProgress.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No tests currently in progress.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sections.inProgress.map((r) => (
                <li key={r.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.requestNumber}</p>
                  </div>
                  <StatusBadge status={r.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Results */}
        <SectionCard title={`Results (${sections.results.length})`} icon={FileText} dense>
          {sections.results.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No results available yet.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sections.results.map((r) => (
                <li key={r.id}>
                  <button
                    className="w-full px-4 sm:px-5 py-3 flex items-center justify-between text-left tap-highlight-none hover:bg-accent/30 transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.result?.test}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.result?.laboratory?.name} · {formatDate(r.result?.resultDate)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.result?.abnormalIndicator && r.result.abnormalIndicator !== "normal" && (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] capitalize h-5 px-1.5">
                          {r.result.abnormalIndicator}
                        </Badge>
                      )}
                      {expanded === r.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {expanded === r.id && r.result && (
                    <div className="border-t border-border/60 px-4 sm:px-5 py-3 space-y-2 text-sm bg-muted/20">
                      <Row label="Value" value={`${r.result.value}${r.result.unit ? ` ${r.result.unit}` : ""}`} />
                      <Row label="Reference range" value={r.result.referenceRange ?? "—"} />
                      <Row label="Indicator" value={<span className="capitalize">{r.result.abnormalIndicator ?? "normal"}</span>} />
                      <Row label="Sample collected" value={formatDate(r.result.sampleCollectionDate)} />
                      <Row label="Result published" value={formatDate(r.result.resultDate)} />
                      <Row label="Reviewer" value={r.result.reviewer ?? "—"} />
                      {r.result.interpretation && (
                        <div className="rounded-md bg-background border border-border/60 p-2 text-xs text-muted-foreground leading-relaxed">{r.result.interpretation}</div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Booking bottom sheet */}
      <LabBookingSheet
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
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function LabBookingSheet({
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

  useEffect(() => {
    if (request) {
      setLabId(labs[0]?.id ?? "");
      setMode("facility");
      setHomeAddress("");
      setDate("");
      setTime("");
    }
  }, [request?.id]);

  const price = 8000;

  const canConfirm = !!request && !!labId && !!date && !!time && (mode === "facility" || !!homeAddress.trim());

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
    <Sheet open={!!request} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] flex flex-col rounded-t-3xl sm:max-w-md sm:mx-auto sm:rounded-2xl">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <SheetTitle className="text-left text-base">Book laboratory test</SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            {request ? `${request.tests.join(", ")} · ${request.requestNumber}` : ""}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Choose laboratory</Label>
            <Select value={labId} onValueChange={setLabId}>
              <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder="Select a lab" /></SelectTrigger>
              <SelectContent>
                {labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.city}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Collection mode</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                onClick={() => setMode("facility")}
                className={`rounded-xl border p-3 text-left text-sm transition-all tap-highlight-none ${mode === "facility" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <Building2 className={`h-4 w-4 mb-1 ${mode === "facility" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="font-medium">Facility visit</p>
                <p className="text-xs text-muted-foreground">Visit the lab</p>
              </button>
              <button
                onClick={() => setMode("home")}
                className={`rounded-xl border p-3 text-left text-sm transition-all tap-highlight-none ${mode === "home" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <Home className={`h-4 w-4 mb-1 ${mode === "home" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="font-medium">Home collection</p>
                <p className="text-xs text-muted-foreground">Sample at home</p>
              </button>
            </div>
          </div>

          {mode === "home" && (
            <div>
              <Label className="text-xs text-muted-foreground">Home address</Label>
              <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} placeholder="House number, street, area, city" className="mt-1.5" />
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Date</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-1.5">
              {days.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDate(d.value)}
                  className={`rounded-lg border p-2 text-center text-xs transition-all tap-highlight-none ${date === d.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                >
                  <p className="text-[9px] text-muted-foreground uppercase">{d.sub}</p>
                  <p className="font-semibold">{d.label}</p>
                </button>
              ))}
            </div>
          </div>

          {date && (
            <div>
              <Label className="text-xs text-muted-foreground">Time slot</Label>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {TIME_SLOTS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTime(t)}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition-all tap-highlight-none ${time === t ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/30"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-muted/30 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Test booking fee</span><span className="font-medium">{formatCurrency(price)}</span></div>
            <div className="flex justify-between border-t border-border/80 pt-2 mt-1"><span className="font-semibold">Total</span><span className="font-bold text-base text-primary">{formatCurrency(price)}</span></div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-700 flex items-center gap-1.5">
            <Lock className="h-3 w-3 shrink-0" /> Prototype — no real payment is processed.
          </div>
        </div>
        <SheetFooter className="p-4 border-t border-border/60 shrink-0">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button disabled={busy || !canConfirm} onClick={confirm} className="flex-1">
              {busy ? "Booking…" : `Pay ${formatCurrency(price)}`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
