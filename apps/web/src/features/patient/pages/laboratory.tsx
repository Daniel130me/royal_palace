"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LaboratoryBookingStatus,
  LaboratoryRequestResponse,
  LaboratoryResultResponse,
  PublicOrganizationSummary,
} from "@royal-palace/contracts";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Lock,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LaboratoryResultCard } from "@/features/shared/laboratory-result-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatTime } from "@/lib/format";
import { productionLaboratoryService, publicDiscoveryService } from "@/lib/services";
import { usePatientContext } from "../use-patient-context";

const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
const ACTIVE_BOOKING_STATUSES: ReadonlySet<LaboratoryBookingStatus> = new Set([
  "CONFIRMED",
  "SAMPLE_COLLECTION_PENDING",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "RESULT_READY",
]);

type LabTab = "pending" | "bookings" | "results";

function nextDays(count: number): { label: string; sub: string; value: string }[] {
  const result: { label: string; sub: string; value: string }[] = [];
  const today = new Date();
  for (let offset = 1; offset <= count; offset += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    result.push({
      label: date.toLocaleDateString("en", { day: "2-digit", month: "short" }),
      sub: offset === 1 ? "Tomorrow" : date.toLocaleDateString("en", { weekday: "short" }),
      value: date.toISOString().slice(0, 10),
    });
  }
  return result;
}

function activeBooking(request: LaboratoryRequestResponse) {
  return request.bookings.find((booking) => booking.status !== "CANCELLED");
}

export function PatientLaboratory() {
  const { profile } = usePatientContext();
  const [requests, setRequests] = useState<readonly LaboratoryRequestResponse[]>([]);
  const [results, setResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [bookingFor, setBookingFor] = useState<LaboratoryRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [resultEndCursor, setResultEndCursor] = useState<string | null>(null);
  const [hasNextResultPage, setHasNextResultPage] = useState(false);
  const [loadingMoreResults, setLoadingMoreResults] = useState(false);
  const [tab, setTab] = useState<LabTab>("pending");

  const load = useCallback(
    async (cursor?: string) => {
      if (!profile) return;
      if (cursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const production = await productionLaboratoryService.patient.list(cursor);
        setRequests((current) =>
          cursor === undefined ? production.data : [...current, ...production.data],
        );
        setEndCursor(production.pageInfo.endCursor);
        setHasNextPage(production.pageInfo.hasNextPage);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Laboratory requests could not be loaded.",
        );
      } finally {
        if (cursor === undefined) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [profile],
  );

  const loadResults = useCallback(async (cursor?: string) => {
    if (cursor !== undefined) setLoadingMoreResults(true);
    try {
      const response = await productionLaboratoryService.patient.results(cursor);
      setResults((current) =>
        cursor === undefined ? response.data : [...current, ...response.data],
      );
      setResultEndCursor(response.pageInfo.endCursor);
      setHasNextResultPage(response.pageInfo.hasNextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory results could not be loaded.");
    } finally {
      setLoadingMoreResults(false);
    }
  }, []);

  useEffect(() => {
    void load(undefined);
    void loadResults(undefined);
  }, [load, loadResults]);

  const sections = useMemo(() => {
    const ordered = [...requests].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    return {
      pending: ordered.filter((request) => request.status === "ACTIVE" && !activeBooking(request)),
      bookings: ordered.filter((request) => {
        const booking = activeBooking(request);
        return booking !== undefined && ACTIVE_BOOKING_STATUSES.has(booking.status);
      }),
    };
  }, [requests]);

  if (loading) return <LoadingState label="Loading laboratory…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Laboratory" description="Book tests, track samples and view results." />

      <SegmentedControl<LabTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: "Pending", badge: sections.pending.length || undefined },
          { value: "bookings", label: "Bookings", badge: sections.bookings.length || undefined },
          { value: "results", label: "Results", badge: results.length || undefined },
        ]}
      />

      {tab === "pending" &&
        (sections.pending.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No pending tests"
            description="Your practitioner can request laboratory tests during a consultation."
            compact
          />
        ) : (
          <div className="divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
            {sections.pending.map((request) => (
              <CompactListItem
                key={request.id}
                leading={
                  <div className="rounded-lg bg-amber-100 p-2">
                    <FlaskConical className="h-4 w-4 text-amber-700" />
                  </div>
                }
                title={request.service.name}
                subtitle={`${request.requestNumber} · requested by ${request.practitioner.displayName}`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setBookingFor(request)}
                    >
                      Book
                    </Button>
                    <StatusBadge status={request.priority.toLowerCase()} size="sm" />
                  </div>
                }
                onClick={() => setBookingFor(request)}
                chevron
              />
            ))}
          </div>
        ))}

      {tab === "bookings" &&
        (sections.bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings"
            description="Upcoming tests appear here after you select a verified laboratory."
            compact
          />
        ) : (
          <div className="space-y-2">
            {sections.bookings.map((request) => (
              <BookingRow key={request.id} request={request} />
            ))}
          </div>
        ))}

      {tab === "results" &&
        (results.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No results yet"
            description="Completed laboratory results will appear here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {results.map((result) => (
              <LaboratoryResultCard
                downloadAttachment={(resultId, attachmentId) =>
                  productionLaboratoryService.patient.resultAttachmentDownload(
                    resultId,
                    attachmentId,
                  )
                }
                key={result.id}
                result={result}
              />
            ))}
          </div>
        ))}

      {tab === "results" && hasNextResultPage && resultEndCursor && (
        <div className="flex justify-center">
          <Button
            disabled={loadingMoreResults}
            onClick={() => void loadResults(resultEndCursor)}
            variant="outline"
          >
            {loadingMoreResults ? "Loading…" : "Load more results"}
          </Button>
        </div>
      )}

      {hasNextPage && endCursor && tab !== "results" && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void load(endCursor)}>
            {loadingMore ? "Loading…" : "Load more requests"}
          </Button>
        </div>
      )}

      <LabBookingSheet
        request={bookingFor}
        onBooked={() => {
          setBookingFor(null);
          void load(undefined);
        }}
        onClose={() => setBookingFor(null)}
      />
    </div>
  );
}

function BookingRow({ request }: { request: LaboratoryRequestResponse }) {
  const booking = activeBooking(request);
  if (!booking) return null;
  const sampleDone = ["SAMPLE_COLLECTED", "PROCESSING", "RESULT_READY", "COMPLETED"].includes(
    booking.status,
  );
  const resultDone = ["RESULT_READY", "COMPLETED"].includes(booking.status);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{request.service.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {booking.laboratory.displayName} ·{" "}
            {booking.scheduledAt ? formatDate(booking.scheduledAt) : "Schedule pending"}
          </p>
        </div>
        <StatusBadge status={booking.status.toLowerCase()} size="sm" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <Milestone label="Booked" done />
        <Milestone label="Sample" done={sampleDone} />
        <Milestone label="Result" done={resultDone} />
      </div>
    </div>
  );
}

function Milestone({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-1 rounded-full px-2 py-1 ${done ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
    >
      {done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {label}
    </div>
  );
}

function LabBookingSheet({
  onBooked,
  onClose,
  request,
}: {
  onBooked: () => void;
  onClose: () => void;
  request: LaboratoryRequestResponse | null;
}) {
  const [laboratories, setLaboratories] = useState<readonly PublicOrganizationSummary[]>([]);
  const [laboratoryId, setLaboratoryId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => nextDays(14), []);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLaboratories([]);
    setLaboratoryId("");
    setDate("");
    setTime("");
    setError(null);
    setLoading(true);
    publicDiscoveryService
      .laboratories({ limit: 50, service: request.service.code }, controller.signal)
      .then((response) => setLaboratories(response.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "Compatible laboratories could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  async function confirm() {
    if (!request || !laboratoryId || !date || !time) return;
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    setBusy(true);
    setError(null);
    try {
      await productionLaboratoryService.patient.book(
        request.id,
        {
          expectedVersion: request.version,
          laboratoryOrganizationId: laboratoryId,
          scheduledAt,
        },
        crypto.randomUUID(),
      );
      toast.success("Laboratory test booked.");
      onBooked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The booking could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const selected = laboratories.find((laboratory) => laboratory.id === laboratoryId);
  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] rounded-t-3xl sm:mx-auto sm:max-w-md sm:rounded-2xl"
      >
        <SheetHeader className="border-b border-border/60 pb-3">
          <SheetTitle className="text-left text-base">Book laboratory test</SheetTitle>
          <p className="text-left text-xs text-muted-foreground">
            {request ? `${request.service.name} · ${request.requestNumber}` : ""}
          </p>
        </SheetHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto py-4">
          <div>
            <Label>Verified laboratory offering this test</Label>
            <Select value={laboratoryId} onValueChange={setLaboratoryId} disabled={loading}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue
                  placeholder={loading ? "Finding compatible laboratories…" : "Select a laboratory"}
                />
              </SelectTrigger>
              <SelectContent>
                {laboratories.map((laboratory) => (
                  <SelectItem key={laboratory.id} value={laboratory.id}>
                    {laboratory.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading && laboratories.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                No verified laboratory currently offers this exact service.
              </p>
            )}
          </div>

          {selected?.locations[0] && (
            <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {selected.displayName}
              </p>
              <p className="mt-1 flex items-start gap-1">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                {selected.locations[0].label}
              </p>
            </div>
          )}

          <div>
            <Label>Date</Label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {days.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setDate(day.value)}
                  className={`rounded-lg border p-2 text-center text-xs ${date === day.value ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <p className="text-[9px] uppercase text-muted-foreground">{day.sub}</p>
                  <p className="font-semibold">{day.label}</p>
                </button>
              ))}
            </div>
          </div>

          {date && (
            <div>
              <Label>Time slot ({timeZone})</Label>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${time === slot ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This reserves the laboratory and collection time. Pricing and payment remain in the
            approved commercial workflow and are not simulated here.
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <SheetFooter className="border-t border-border/60 pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              disabled={busy || !laboratoryId || !date || !time}
              onClick={confirm}
              className="flex-1"
            >
              {busy ? "Booking…" : "Confirm booking"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
