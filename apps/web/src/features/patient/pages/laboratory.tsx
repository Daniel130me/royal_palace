"use client";

import { useEffect, useMemo, useState } from "react";
import { labRequestService, laboratoryService } from "@/lib/services";
import type { LaboratoryRequest, Laboratory } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, ExpandableCard } from "@/components/healthcare/compact-list";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FlaskConical, Clock, Building2, Home,
  Lock, CalendarDays, AlertCircle, FileText, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const IN_PROGRESS_STATUSES = ["sample_collected", "processing", "quality_review"];

type LabTab = "pending" | "bookings" | "results";

export function PatientLaboratory() {
  const { profile } = usePatientContext();
  const [requests, setRequests] = useState<LaboratoryRequest[]>([]);
  const [labs, setLabs] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingFor, setBookingFor] = useState<LaboratoryRequest | null>(null);
  const [tab, setTab] = useState<LabTab>("pending");

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
    const bookings = requests.filter((r) => r.status === "booked" || IN_PROGRESS_STATUSES.includes(r.status));
    const results = requests.filter((r) => r.status === "completed" && r.result);
    return { pending, bookings, results };
  }, [requests]);

  if (loading) return <LoadingState label="Loading laboratory…" />;
  if (error) return <EmptyState title="Could not load laboratory" description={error} />;

  const activeCount = sections.pending.length || undefined;
  const bookingsCount = sections.bookings.length || undefined;
  const resultsCount = sections.results.length || undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory"
        description="Book tests, track samples and view results."
      />

      <SegmentedControl<LabTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: "Pending", badge: activeCount },
          { value: "bookings", label: "Bookings", badge: bookingsCount },
          { value: "results", label: "Results", badge: resultsCount },
        ]}
      />

      {tab === "pending" && (
        sections.pending.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No pending tests"
            description="Your doctor can request lab tests during a consultation."
            compact
          />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden divide-y divide-amber-100">
            {sections.pending.map((r) => (
              <CompactListItem
                key={r.id}
                leading={
                  <div className="rounded-lg bg-amber-100 p-2 ring-1 ring-amber-200">
                    <FlaskConical className="h-4 w-4 text-amber-700" />
                  </div>
                }
                title={r.tests.join(", ")}
                subtitle={`${r.requestNumber} · requested by ${r.provider ? fullName(r.provider) : "Provider"}`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setBookingFor(r)}>Book</Button>
                    {r.fastingRequired && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] h-4 px-1 gap-0.5">
                        <AlertCircle className="h-2.5 w-2.5" /> Fasting
                      </Badge>
                    )}
                  </div>
                }
                onClick={r.preparationInstructions ? () => setBookingFor(r) : undefined}
                chevron={!!r.preparationInstructions}
              />
            ))}
          </div>
        )
      )}

      {tab === "bookings" && (
        sections.bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings"
            description="Upcoming lab appointments will appear here once you book a test."
            compact
          />
        ) : (
          <div className="space-y-2">
            {sections.bookings.map((r) => (
              <BookingRow key={r.id} request={r} />
            ))}
          </div>
        )
      )}

      {tab === "results" && (
        sections.results.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No results yet"
            description="Completed lab results will appear here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {sections.results.map((r) => (
              <ExpandableCard
                key={r.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
                    <FlaskConical className="h-4 w-4 text-sky-700" />
                  </div>
                }
                title={r.result?.test ?? r.tests[0]}
                subtitle={`${r.result?.laboratory?.name ?? "Lab"} · ${formatDate(r.result?.resultDate)}`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    {r.result?.value && (
                      <span className="text-sm font-semibold">
                        {r.result.value}{r.result.unit ? ` ${r.result.unit}` : ""}
                      </span>
                    )}
                    {r.result?.abnormalIndicator && r.result.abnormalIndicator !== "normal" ? (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] capitalize h-5 px-1.5">
                        {r.result.abnormalIndicator}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5 px-1.5 gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Normal
                      </Badge>
                    )}
                  </div>
                }
              >
                <div className="space-y-2">
                  <Row label="Value" value={`${r.result!.value}${r.result!.unit ? ` ${r.result!.unit}` : ""}`} />
                  <Row label="Reference range" value={r.result!.referenceRange ?? "—"} />
                  <Row label="Indicator" value={<span className="capitalize">{r.result!.abnormalIndicator ?? "normal"}</span>} />
                  <Row label="Sample collected" value={formatDate(r.result!.sampleCollectionDate)} />
                  <Row label="Result published" value={formatDate(r.result!.resultDate)} />
                  <Row label="Reviewer" value={r.result!.reviewer ?? "—"} />
                  {r.result!.interpretation && (
                    <div className="rounded-md bg-muted/40 border border-border/60 p-2 text-xs text-muted-foreground leading-relaxed">
                      {r.result!.interpretation}
                    </div>
                  )}
                </div>
              </ExpandableCard>
            ))}
          </div>
        )
      )}

      <LabBookingSheet
        request={bookingFor}
        labs={labs}
        onClose={() => setBookingFor(null)}
        patientId={profile?.id ?? ""}
      />
    </div>
  );
}

function BookingRow({ request: r }: { request: LaboratoryRequest }) {
  const booking = r.booking;
  const isInProgress = IN_PROGRESS_STATUSES.includes(r.status);
  const milestones = [
    { key: "booked", label: "Booked", done: true },
    { key: "sample_collected", label: "Sample", done: ["sample_collected", "processing", "quality_review"].includes(r.status) },
    { key: "completed", label: "Result", done: r.status === "completed" },
  ];
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{r.tests.join(", ")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {booking?.laboratory?.name ?? "Laboratory"} · {formatDate(booking?.date)} · {formatTime(booking?.time)}
          </p>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{booking?.collectionMode ?? "facility"} collection</p>
        </div>
        <StatusBadge status={r.status} size="sm" />
      </div>
      {/* Mini status timeline */}
      <div className="mt-3 flex items-center gap-1.5">
        {milestones.map((m, i) => (
          <div key={m.key} className="flex items-center gap-1.5 flex-1">
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
              m.done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-muted text-muted-foreground ring-1 ring-border/60"
            )}>
              {m.done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
              <span>{m.label}</span>
            </div>
            {i < milestones.length - 1 && (
              <div className={cn("h-px flex-1 min-w-2", m.done && milestones[i + 1].done ? "bg-emerald-300" : "bg-border/60")} />
            )}
          </div>
        ))}
      </div>
      {isInProgress && (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
          <Clock className="h-3 w-3" /> Test in progress — results will be available shortly.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
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
