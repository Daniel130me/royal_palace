"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import {
  laboratoryService, labRequestService, settlementService,
} from "@/lib/services";
import type {
  LaboratoryBooking, LaboratoryRequest, LaboratoryResult, Settlement,
} from "@/types";
import {
  PageHeader, SectionCard, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatTime, relativeDay, fullName, initials } from "@/lib/format";
import {
  FlaskConical, CalendarClock, TestTube, Microscope, FileCheck2, AlertTriangle,
  Wallet, Hourglass, ArrowRight, Home, Activity, CheckCircle2,
} from "lucide-react";

const COMPLETED_BOOKING_STATUSES = ["completed", "result_published"];

export function LabDashboard() {
  const { lab, labId, loading, error, reload } = useLabContext();
  const [requests, setRequests] = useState<LaboratoryRequest[]>([]);
  const [bookings, setBookings] = useState<LaboratoryBooking[]>([]);
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!labId) return;
    setDataLoading(true);
    Promise.all([
      labRequestService.list(),
      laboratoryService.bookings(labId),
      laboratoryService.results(labId),
      settlementService.list({ entityType: "laboratory", entityId: labId }).catch(() => [] as Settlement[]),
    ])
      .then(([reqs, bks, res, stl]) => {
        setRequests(reqs);
        setBookings(bks);
        setResults(res);
        setSettlements(stl);
        setDataError(null);
      })
      .catch((e: unknown) =>
        setDataError(e instanceof Error ? e.message : "Failed to load dashboard data.")
      )
      .finally(() => setDataLoading(false));
  }, [labId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const incoming = useMemo(() => requests.filter((r) => r.status === "pending_booking"), [requests]);
  const labBookings = useMemo(
    () => [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [bookings]
  );
  const todayBookings = useMemo(() => labBookings.filter((b) => b.date === todayStr), [labBookings, todayStr]);
  const homeCollections = useMemo(
    () => labBookings.filter((b) => b.collectionMode === "home" && !COMPLETED_BOOKING_STATUSES.includes(b.status) && b.status !== "cancelled"),
    [labBookings]
  );
  const samplesAwaiting = useMemo(() => labBookings.filter((b) => ["booked", "sample_collected"].includes(b.status)), [labBookings]);
  const inProgress = useMemo(() => labBookings.filter((b) => ["processing", "quality_review"].includes(b.status)), [labBookings]);
  const awaitingUpload = useMemo(
    () => labBookings.filter((b) => b.status === "quality_review" || (b.status === "completed" && !results.some((r) => r.bookingId === b.id))),
    [labBookings, results]
  );
  const criticalResults = useMemo(() => results.filter((r) => r.abnormalIndicator === "critical"), [results]);
  const earnings = useMemo(
    () => labBookings.filter((b) => COMPLETED_BOOKING_STATUSES.includes(b.status)).reduce((sum, b) => sum + (b.price || 0), 0),
    [labBookings]
  );
  const pendingSettlements = useMemo(() => settlements.filter((s) => s.status === "pending"), [settlements]);
  const settledTotal = useMemo(() => settlements.filter((s) => s.status === "paid").reduce((sum, s) => sum + s.netAmount, 0), [settlements]);

  if (loading || dataLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (dataError) return <ErrorState message={dataError} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${lab.name}`}
        description={`${lab.address}, ${lab.city} · ${lab.laboratoryNumber}`}
        actions={
          <Button variant="outline" onClick={() => navigate("laboratory", "requests")}>
            <FlaskConical className="h-4 w-4" /> View test requests
          </Button>
        }
      />

      {/* Critical results alert — prominent when present */}
      {criticalResults.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <div className="rounded-xl bg-rose-100 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-800">
              {criticalResults.length} critical result{criticalResults.length === 1 ? "" : "s"} require immediate provider notification
            </p>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              Per Royal Palace protocol, critical results must be communicated to the referring provider within 1 hour.
            </p>
          </div>
          <Button size="sm" variant="destructive" className="shrink-0" onClick={() => navigate("laboratory", "critical-results")}>
            Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Incoming Requests" value={incoming.length} icon={FlaskConical} tone="warning" onClick={() => navigate("laboratory", "requests")} />
        <MetricCard label="Today's Bookings" value={todayBookings.length} icon={CalendarClock} tone="info" onClick={() => navigate("laboratory", "bookings")} />
        <MetricCard label="Awaiting Sample" value={samplesAwaiting.length} icon={TestTube} tone="info" onClick={() => navigate("laboratory", "bookings")} />
        <MetricCard label="Tests In Progress" value={inProgress.length} icon={Microscope} tone="info" onClick={() => navigate("laboratory", "bookings")} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Awaiting Upload" value={awaitingUpload.length} icon={FileCheck2} tone="warning" onClick={() => navigate("laboratory", "results")} />
        <MetricCard label="Critical Results" value={criticalResults.length} icon={AlertTriangle} tone="danger" onClick={() => navigate("laboratory", "critical-results")} />
        <MetricCard label="Earnings (Completed)" value={formatCurrency(earnings)} icon={Wallet} tone="success" onClick={() => navigate("laboratory", "settlements")} />
        <MetricCard label="Settlements Pending" value={pendingSettlements.length} icon={Hourglass} tone="warning" onClick={() => navigate("laboratory", "settlements")} />
      </div>

      {/* Mini metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Today's bookings" value={todayBookings.length} tone="info" />
        <MiniMetric label="Home collections" value={homeCollections.length} tone="violet" />
        <MiniMetric label="Settled total" value={formatCurrency(settledTotal)} tone="success" />
        <MiniMetric label="Pending payout" value={formatCurrency(pendingSettlements.reduce((s, x) => s + x.netAmount, 0))} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Incoming test requests"
            icon={FlaskConical}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "requests")}>View all</Button>}
          >
            {incoming.length === 0 ? (
              <EmptyState icon={FlaskConical} title="No new test requests" description="Pending laboratory requests from providers will appear here." compact />
            ) : (
              <ul className="space-y-2">
                {incoming.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => navigate("laboratory", "request", { id: r.id })}
                      className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 hover:border-primary/40 hover:shadow-soft transition-all tap-highlight-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.tests.join(", ")}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.patient ? fullName(r.patient) : "Patient"} · Dr {r.provider?.lastName ?? "Provider"} · {r.requestNumber}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={r.priority} size="sm" />
                        <StatusBadge status={r.status} size="sm" />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Today's bookings"
            icon={CalendarClock}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View all</Button>}
          >
            {todayBookings.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No bookings today" description="Bookings scheduled for today will appear here." compact />
            ) : (
              <ul className="space-y-2">
                {todayBookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                          {b.patient ? initials(fullName(b.patient)) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{b.request?.tests?.join(", ") ?? "Lab tests"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatTime(b.time)} · {b.patient ? fullName(b.patient) : "Patient"} · {b.collectionMode === "home" ? "Home collection" : "Facility"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={b.status} size="sm" />
                      <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "bookings")}>Open</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Tests in progress"
            icon={Microscope}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View all</Button>}
          >
            {inProgress.length === 0 ? (
              <EmptyState icon={Microscope} title="No tests in progress" description="Samples being processed or under quality review will appear here." compact />
            ) : (
              <ul className="space-y-2">
                {inProgress.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{b.request?.tests?.join(", ") ?? "Lab tests"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.patient ? fullName(b.patient) : "Patient"} · {b.bookingNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={b.status} size="sm" />
                      {b.status === "quality_review" ? (
                        <Button size="sm" onClick={() => navigate("laboratory", "result-new", { bookingId: b.id, requestId: b.requestId })}>
                          <FileCheck2 className="h-3.5 w-3.5" /> Upload
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "bookings")}>Open</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Home collections" icon={Home} action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View</Button>} dense>
            <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
              {homeCollections.length === 0 ? (
                <li className="text-sm text-muted-foreground py-8 text-center">No scheduled home collections.</li>
              ) : homeCollections.map((b) => (
                <li key={b.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{b.request?.tests?.join(", ")}</p>
                    <StatusBadge status={b.status} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {relativeDay(b.date)} · {formatTime(b.time)}
                  </p>
                  {b.homeAddress && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{b.homeAddress}</p>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Critical results"
            icon={AlertTriangle}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "critical-results")}>View</Button>}
            dense
            className={criticalResults.length > 0 ? "border-rose-200" : ""}
          >
            <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
              {criticalResults.length === 0 ? (
                <li className="py-8 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No critical results.</p>
                </li>
              ) : criticalResults.slice(0, 5).map((r) => (
                <li key={r.id} className="m-3 rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{r.test}</p>
                    <StatusBadge status="critical" size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {r.patient ? fullName(r.patient) : "Patient"} · {r.value} {r.unit ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reported {formatDate(r.resultDate)}</p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Recent results" icon={Activity} action={<Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "results")}>View all</Button>} dense>
            <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
              {results.length === 0 ? (
                <li className="text-sm text-muted-foreground py-8 text-center">No results published yet.</li>
              ) : [...results]
                  .sort((a, b) => b.resultDate.localeCompare(a.resultDate))
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{r.test}</p>
                        {r.abnormalIndicator && r.abnormalIndicator !== "normal" ? (
                          <StatusBadge status={r.abnormalIndicator} size="sm" />
                        ) : (
                          <StatusBadge status="normal" size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {r.patient ? fullName(r.patient) : "Patient"} · {r.value} {r.unit ?? ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.resultDate)}</p>
                    </li>
                  ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
