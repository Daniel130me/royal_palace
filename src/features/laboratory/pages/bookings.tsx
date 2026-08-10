"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { laboratoryService, labRequestService } from "@/lib/services";
import type { LaboratoryBooking } from "@/types";
import {
  PageHeader, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { toast } from "sonner";
import { formatCurrency, formatTime, relativeDay, nextLabStatuses, fullName } from "@/lib/format";
import {
  CalendarClock, Search, ArrowRight, FileCheck2, MapPin, Home, Building2,
  CheckCircle2, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "scheduled" | "processing" | "ready" | "published";

const COMPLETED_STATUSES = ["completed", "result_published"];
const TERMINAL_STATUSES = [...COMPLETED_STATUSES, "cancelled"];

const WORKFLOW_STEPS = [
  { key: "booked", label: "Booked" },
  { key: "sample_collected", label: "Sample" },
  { key: "processing", label: "Processing" },
  { key: "quality_review", label: "Review" },
  { key: "completed", label: "Done" },
];

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LabBookings() {
  const { labId, reload } = useLabContext();
  const [bookings, setBookings] = useState<LaboratoryBooking[]>([]);
  const [results, setResults] = useState<{ bookingId?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("scheduled");
  const [query, setQuery] = useState("");
  const [progressing, setProgressing] = useState<string | null>(null);

  const load = () => {
    if (!labId) return;
    setLoading(true);
    Promise.all([
      laboratoryService.bookings(labId),
      laboratoryService.results(labId).then((r) => r.map((res) => ({ bookingId: res.bookingId }))).catch(() => []),
    ])
      .then(([bks, res]) => {
        setBookings(bks);
        setResults(res);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load bookings."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [labId]);

  const sorted = useMemo(() => [...bookings].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)), [bookings]);
  const scheduled = sorted.filter((b) => ["booked", "sample_collected"].includes(b.status));
  const processing = sorted.filter((b) => ["processing", "quality_review"].includes(b.status));
  const ready = sorted.filter((b) => b.status === "completed" && !results.some((r) => r.bookingId === b.id));
  const published = sorted.filter((b) => TERMINAL_STATUSES.includes(b.status));

  const visible = useMemo(() => {
    const base = tab === "scheduled" ? scheduled : tab === "processing" ? processing : tab === "ready" ? ready : published;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((b) =>
      b.bookingNumber.toLowerCase().includes(q) ||
      (b.patient && `${b.patient.firstName} ${b.patient.lastName}`.toLowerCase().includes(q)) ||
      (b.request?.tests?.join(" ").toLowerCase().includes(q)) ||
      (b.request?.requestNumber.toLowerCase().includes(q))
    );
  }, [tab, query, scheduled, processing, ready, published]);

  const handleProgress = (booking: LaboratoryBooking, next: string) => {
    setProgressing(booking.id);
    labRequestService
      .progress(booking.id, next, labId ?? "")
      .then(() => {
        toast.success(`Booking advanced to ${humanise(next)}.`);
        load();
        reload();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update booking."))
      .finally(() => setProgressing(null));
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-9 bg-muted/40 animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        description="Sample collections and tests in progress."
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by booking, patient or test…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <SegmentedControl
        options={[
          { value: "scheduled" as TabKey, label: "Scheduled", badge: scheduled.length },
          { value: "processing" as TabKey, label: "Processing", badge: processing.length },
          { value: "ready" as TabKey, label: "Ready", badge: ready.length },
          { value: "published" as TabKey, label: "Published", badge: published.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No bookings"
          description="No bookings match this filter."
          compact
        />
      ) : (
        <div className="space-y-2">
          {visible.map((b) => {
            const nextStatuses = nextLabStatuses(b.status);
            const hasResult = results.some((r) => r.bookingId === b.id);
            const currentStepIdx = WORKFLOW_STEPS.findIndex((s) => s.key === b.status);
            const isTerminal = b.status === "result_published" || b.status === "cancelled";
            return (
              <ExpandableCard
                key={b.id}
                leading={
                  <div className={cn("rounded-lg p-2 ring-1", b.collectionMode === "home" ? "bg-violet-50 ring-violet-100" : "bg-sky-50 ring-sky-100")}>
                    {b.collectionMode === "home" ? <Home className="h-4 w-4 text-violet-600" /> : <Building2 className="h-4 w-4 text-sky-600" />}
                  </div>
                }
                title={`${b.bookingNumber} · ${b.request?.tests?.join(", ") ?? "Lab tests"}`}
                subtitle={`${b.patient ? fullName(b.patient) : "Patient"} · ${relativeDay(b.date)} ${formatTime(b.time)} · ${formatCurrency(b.price)}`}
                trailing={<StatusBadge status={b.status} size="sm" />}
              >
                <div className="space-y-3">
                  {/* Mini horizontal status timeline */}
                  <ol className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {WORKFLOW_STEPS.map((step, i) => {
                      const done = i < currentStepIdx;
                      const current = i === currentStepIdx;
                      return (
                        <li key={step.key} className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            done
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : current
                              ? "bg-primary text-primary-foreground shadow-soft"
                              : "bg-muted text-muted-foreground border border-border"
                          )}>
                            {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                            {step.label}
                          </span>
                          {i < WORKFLOW_STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
                        </li>
                      );
                    })}
                  </ol>

                  {b.collectionMode === "home" && b.homeAddress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {b.homeAddress}
                    </p>
                  )}

                  {!isTerminal && nextStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {nextStatuses.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          className="h-8 text-xs"
                          disabled={progressing === b.id}
                          onClick={() => handleProgress(b, s)}
                        >
                          {humanise(s)} <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      ))}
                      {(b.status === "quality_review" || (b.status === "completed" && !hasResult)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => navigate("laboratory", "result-new", { bookingId: b.id, requestId: b.requestId })}
                        >
                          <FileCheck2 className="h-3 w-3 mr-1" /> Upload result
                        </Button>
                      )}
                    </div>
                  )}

                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("laboratory", "request", { id: b.requestId })}>
                    View request →
                  </Button>
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
