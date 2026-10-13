"use client";

import { useEffect, useMemo, useState } from "react";
import type { LaboratoryQueueRequestResponse } from "@royal-palace/contracts";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { laboratoryService, productionLaboratoryService, settlementService } from "@/lib/services";
import type { LaboratoryResult, Settlement } from "@/types";
import {
  PageHeader,
  EmptyState,
  ErrorState,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import { Button } from "@/components/ui/button";
import { formatCurrency, fullName } from "@/lib/format";
import {
  FlaskConical,
  CalendarClock,
  TestTube,
  Microscope,
  FileCheck2,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COMPLETED_BOOKING_STATUSES = ["completed", "result_published"];

export function LabDashboard() {
  const { lab, labId, loading, error, reload } = useLabContext();
  const [requests, setRequests] = useState<readonly LaboratoryQueueRequestResponse[]>([]);
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!labId) return;
    setDataLoading(true);
    Promise.all([
      productionLaboratoryService.laboratory.list(labId),
      laboratoryService.results(labId),
      settlementService
        .list({ entityType: "laboratory", entityId: labId })
        .catch(() => [] as Settlement[]),
    ])
      .then(([queue, res, stl]) => {
        setRequests(queue.data);
        setResults(res);
        setSettlements(stl);
        setDataError(null);
      })
      .catch((e: unknown) =>
        setDataError(e instanceof Error ? e.message : "Failed to load dashboard data."),
      )
      .finally(() => setDataLoading(false));
  }, [labId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const labBookings = useMemo(
    () => requests.flatMap((request) => request.bookings.map((booking) => ({ booking, request }))),
    [requests],
  );
  const incoming = useMemo(
    () =>
      labBookings.filter(({ booking }) =>
        ["CONFIRMED", "SAMPLE_COLLECTION_PENDING"].includes(booking.status),
      ),
    [labBookings],
  );
  const todayBookings = useMemo(
    () => labBookings.filter(({ booking }) => booking.scheduledAt?.startsWith(todayStr)),
    [labBookings, todayStr],
  );
  const samplesAwaiting = useMemo(
    () =>
      labBookings.filter(({ booking }) =>
        ["CONFIRMED", "SAMPLE_COLLECTION_PENDING", "SAMPLE_COLLECTED"].includes(booking.status),
      ),
    [labBookings],
  );
  const inProgress = useMemo(
    () => labBookings.filter(({ booking }) => booking.status === "PROCESSING"),
    [labBookings],
  );
  const awaitingUpload = useMemo(
    () =>
      labBookings.filter(
        ({ booking }) =>
          booking.status === "RESULT_READY" &&
          !results.some((result) => result.bookingId === booking.id),
      ),
    [labBookings, results],
  );
  const criticalResults = useMemo(
    () => results.filter((r) => r.abnormalIndicator === "critical"),
    [results],
  );
  const pendingSettlements = useMemo(
    () => settlements.filter((s) => s.status === "pending"),
    [settlements],
  );

  if (loading || dataLoading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted/40 animate-pulse rounded-2xl" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (dataError) return <ErrorState message={dataError} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  const actionNeededCount = incoming.length + awaitingUpload.length + inProgress.length;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">
            {lab.name} 👋
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {lab.address}, {lab.city}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("laboratory", "requests")} className="shrink-0">
          <FlaskConical className="h-4 w-4" /> View requests
        </Button>
      </div>

      {/* Hero: action needed */}
      {actionNeededCount > 0 ? (
        <button
          onClick={() => navigate("laboratory", "bookings")}
          className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-left shadow-soft transition-all hover:shadow-soft-md active:scale-[0.99] tap-highlight-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-amber-100 p-2.5 shrink-0">
                <FlaskConical className="h-5 w-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 leading-tight">
                  {actionNeededCount} item{actionNeededCount === 1 ? "" : "s"} need action
                </p>
                <p className="text-xs text-amber-700 mt-0.5 truncate">
                  {incoming.length} new requests · {samplesAwaiting.length} awaiting sample ·{" "}
                  {awaitingUpload.length} awaiting upload
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-amber-700 shrink-0" />
          </div>
        </button>
      ) : (
        <button
          onClick={() => navigate("laboratory", "requests")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">All caught up</p>
              <p className="text-xl font-bold mt-1">Check for new requests</p>
              <p className="text-xs text-emerald-100/80 mt-1">No pending work right now</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* Critical results alert — rose hero when present */}
      {criticalResults.length > 0 && (
        <button
          onClick={() => navigate("laboratory", "critical-results")}
          className="w-full rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-left flex items-center gap-3 hover:bg-rose-100/60 transition-colors tap-highlight-none"
        >
          <div className="rounded-xl bg-rose-100 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-900 leading-tight">
              {criticalResults.length} critical result{criticalResults.length === 1 ? "" : "s"}{" "}
              require provider notification
            </p>
            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
              Per protocol, notify the referring provider within 1 hour.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-rose-700 shrink-0" />
        </button>
      )}

      {/* StatTiles row */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile
          label="Incoming"
          value={incoming.length}
          icon={FlaskConical}
          tone="warning"
          onClick={() => navigate("laboratory", "requests")}
        />
        <StatTile
          label="Today"
          value={todayBookings.length}
          icon={CalendarClock}
          tone="info"
          onClick={() => navigate("laboratory", "bookings")}
        />
        <StatTile
          label="Sample"
          value={samplesAwaiting.length}
          icon={TestTube}
          tone="info"
          onClick={() => navigate("laboratory", "bookings")}
        />
        <StatTile
          label="Critical"
          value={criticalResults.length}
          icon={AlertTriangle}
          tone="danger"
          onClick={() => navigate("laboratory", "critical-results")}
        />
      </div>

      {/* Action needed: compact list */}
      {(incoming.length > 0 || awaitingUpload.length > 0 || inProgress.length > 0) && (
        <div className="space-y-2">
          <SectionLabel>Action needed</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {incoming.slice(0, 2).map(({ booking, request }) => (
              <CompactListItem
                key={booking.id}
                leading={
                  <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100">
                    <FlaskConical className="h-4 w-4 text-amber-600" />
                  </div>
                }
                title={request.service.name}
                subtitle={`${request.patient.displayName} · ${request.practitioner.displayName} · ${request.requestNumber}`}
                trailing={
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={request.priority.toLowerCase()} size="sm" />
                    <StatusBadge status={booking.status.toLowerCase()} size="sm" />
                  </div>
                }
                onClick={() => navigate("laboratory", "request", { id: booking.id })}
                chevron
              />
            ))}
            {awaitingUpload.slice(0, 2).map(({ booking, request }) => (
              <CompactListItem
                key={booking.id}
                leading={
                  <div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100">
                    <FileCheck2 className="h-4 w-4 text-violet-600" />
                  </div>
                }
                title={request.service.name}
                subtitle={`${request.patient.displayName} · awaiting result upload`}
                trailing={
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("laboratory", "result-new", {
                        bookingId: booking.id,
                        requestId: request.id,
                      });
                    }}
                  >
                    Upload
                  </Button>
                }
                onClick={() => navigate("laboratory", "bookings")}
                chevron
              />
            ))}
            {inProgress.slice(0, 1).map(({ booking, request }) => (
              <CompactListItem
                key={booking.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
                    <Microscope className="h-4 w-4 text-sky-600" />
                  </div>
                }
                title={`Processing · ${request.service.name}`}
                subtitle={`${request.patient.displayName} · ${booking.bookingNumber}`}
                trailing={<StatusBadge status={booking.status.toLowerCase()} size="sm" />}
                onClick={() => navigate("laboratory", "bookings")}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* Today's bookings */}
      {todayBookings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Today's bookings · {todayBookings.length}</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {todayBookings.slice(0, 4).map(({ booking, request }) => (
              <CompactListItem
                key={booking.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
                    <CalendarClock className="h-4 w-4 text-sky-600" />
                  </div>
                }
                title={request.service.name}
                subtitle={`${booking.scheduledAt ? new Date(booking.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Schedule pending"} · ${request.patient.displayName}`}
                trailing={<StatusBadge status={booking.status.toLowerCase()} size="sm" />}
                onClick={() => navigate("laboratory", "bookings")}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* Finance quick row */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label="Settled total"
          value={formatCurrency(
            settlements.filter((s) => s.status === "paid").reduce((sum, s) => sum + s.netAmount, 0),
          )}
          icon={CheckCircle2}
          tone="success"
          onClick={() => navigate("laboratory", "settlements")}
        />
        <StatTile
          label="Pending payout"
          value={formatCurrency(pendingSettlements.reduce((s, x) => s + x.netAmount, 0))}
          icon={CalendarClock}
          tone="warning"
          onClick={() => navigate("laboratory", "settlements")}
        />
      </div>

      {/* Recent results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Recent results</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {[...results]
              .sort((a, b) => b.resultDate.localeCompare(a.resultDate))
              .slice(0, 3)
              .map((r) => (
                <CompactListItem
                  key={r.id}
                  leading={
                    <div
                      className={cn(
                        "rounded-lg p-2 ring-1",
                        r.abnormalIndicator === "critical"
                          ? "bg-rose-50 ring-rose-100"
                          : r.abnormalIndicator && r.abnormalIndicator !== "normal"
                            ? "bg-amber-50 ring-amber-100"
                            : "bg-emerald-50 ring-emerald-100",
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4",
                          r.abnormalIndicator === "critical"
                            ? "text-rose-600"
                            : r.abnormalIndicator && r.abnormalIndicator !== "normal"
                              ? "text-amber-600"
                              : "text-emerald-600",
                        )}
                      />
                    </div>
                  }
                  title={r.test}
                  subtitle={`${r.patient ? fullName(r.patient) : "Patient"} · ${r.value} ${r.unit ?? ""}`}
                  trailing={
                    r.abnormalIndicator && r.abnormalIndicator !== "normal" ? (
                      <StatusBadge status={r.abnormalIndicator} size="sm" />
                    ) : (
                      <StatusBadge status="normal" size="sm" />
                    )
                  }
                  onClick={() => navigate("laboratory", "results")}
                  chevron
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
      {children}
    </p>
  );
}
