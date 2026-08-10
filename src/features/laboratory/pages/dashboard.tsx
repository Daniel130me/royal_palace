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
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState, ErrorState } from "@/components/healthcare/states";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatTime, relativeDay } from "@/lib/format";
import {
  FlaskConical, CalendarClock, TestTube, Microscope, FileCheck2, AlertTriangle,
  Wallet, Hourglass, ArrowRight, Home, Activity,
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

  const incoming = useMemo(
    () => requests.filter((r) => r.status === "pending_booking"),
    [requests]
  );
  const labBookings = useMemo(
    () => [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [bookings]
  );
  const todayBookings = useMemo(
    () => labBookings.filter((b) => b.date === todayStr),
    [labBookings, todayStr]
  );
  const homeCollections = useMemo(
    () => labBookings.filter((b) => b.collectionMode === "home" && !COMPLETED_BOOKING_STATUSES.includes(b.status) && b.status !== "cancelled"),
    [labBookings]
  );
  const samplesAwaiting = useMemo(
    () => labBookings.filter((b) => ["booked", "sample_collected"].includes(b.status)),
    [labBookings]
  );
  const inProgress = useMemo(
    () => labBookings.filter((b) => ["processing", "quality_review"].includes(b.status)),
    [labBookings]
  );
  const awaitingUpload = useMemo(
    () => labBookings.filter((b) => b.status === "quality_review" || (b.status === "completed" && !results.some((r) => r.bookingId === b.id))),
    [labBookings, results]
  );
  const criticalResults = useMemo(
    () => results.filter((r) => r.abnormalIndicator === "critical"),
    [results]
  );
  const earnings = useMemo(
    () => labBookings
      .filter((b) => COMPLETED_BOOKING_STATUSES.includes(b.status))
      .reduce((sum, b) => sum + (b.price || 0), 0),
    [labBookings]
  );
  const pendingSettlements = useMemo(
    () => settlements.filter((s) => s.status === "pending"),
    [settlements]
  );

  if (loading || dataLoading) return <LoadingState label="Loading laboratory dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (dataError) return <ErrorState message={dataError} onRetry={reload} />;
  if (!lab) return <ErrorState message="Laboratory profile not found." />;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${lab.name}`}
        description={`${lab.address}, ${lab.city} · ${lab.laboratoryNumber}`}
        actions={
          <Button variant="outline" onClick={() => navigate("laboratory", "requests")}>
            <FlaskConical className="h-4 w-4 mr-1" /> View test requests
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Incoming Requests" value={incoming.length} icon={FlaskConical} tone="warning" onClick={() => navigate("laboratory", "requests")} />
        <MetricCard label="Today's Bookings" value={todayBookings.length} icon={CalendarClock} tone="info" onClick={() => navigate("laboratory", "bookings")} />
        <MetricCard label="Awaiting Sample" value={samplesAwaiting.length} icon={TestTube} tone="info" onClick={() => navigate("laboratory", "bookings")} />
        <MetricCard label="Tests In Progress" value={inProgress.length} icon={Microscope} tone="info" onClick={() => navigate("laboratory", "bookings")} />
        <MetricCard label="Awaiting Upload" value={awaitingUpload.length} icon={FileCheck2} tone="warning" onClick={() => navigate("laboratory", "results")} />
        <MetricCard label="Critical Results" value={criticalResults.length} icon={AlertTriangle} tone="danger" onClick={() => navigate("laboratory", "critical-results")} />
        <MetricCard label="Earnings (Completed)" value={formatCurrency(earnings)} icon={Wallet} tone="success" onClick={() => navigate("laboratory", "settlements")} />
        <MetricCard label="Settlements Pending" value={pendingSettlements.length} icon={Hourglass} tone="warning" onClick={() => navigate("laboratory", "settlements")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Incoming requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Incoming test requests</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "requests")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {incoming.length === 0 ? (
                <EmptyState icon={FlaskConical} title="No new test requests" description="Pending laboratory requests from providers will appear here." />
              ) : incoming.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate("laboratory", "request", { id: r.id })}
                  className="w-full text-left flex items-center justify-between rounded-lg border p-3 hover:border-emerald-400 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"} · {r.provider ? `Dr ${r.provider.lastName}` : "Provider"} · {r.requestNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <StatusBadge status={r.priority} />
                    <StatusBadge status={r.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Today's bookings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Today's bookings</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {todayBookings.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No bookings today" description="Bookings scheduled for today will appear here." />
              ) : todayBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {b.request?.tests?.join(", ") ?? "Lab tests"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(b.time)} · {b.patient ? `${b.patient.firstName} ${b.patient.lastName}` : "Patient"} · {b.collectionMode === "home" ? "Home collection" : "Facility"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "bookings")}>Open</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tests in progress */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Tests in progress</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {inProgress.length === 0 ? (
                <EmptyState icon={Microscope} title="No tests in progress" description="Samples being processed or under quality review will appear here." />
              ) : inProgress.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.request?.tests?.join(", ") ?? "Lab tests"}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.patient ? `${b.patient.firstName} ${b.patient.lastName}` : "Patient"} · {b.bookingNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    {b.status === "quality_review" ? (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("laboratory", "result-new", { bookingId: b.id, requestId: b.requestId })}>
                        <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Upload result
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "bookings")}>Open</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Home collections */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><Home className="h-4 w-4" /> Home collections</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "bookings")}>View</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {homeCollections.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No scheduled home collections.</p>
              ) : homeCollections.map((b) => (
                <div key={b.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{b.request?.tests?.join(", ")}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {relativeDay(b.date)} · {formatTime(b.time)}
                  </p>
                  {b.homeAddress && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">📍 {b.homeAddress}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Critical results */}
          <Card className={criticalResults.length > 0 ? "border-rose-200 bg-rose-50/40" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-rose-600" /> Critical results</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "critical-results")}>View</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {criticalResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No critical results.</p>
              ) : criticalResults.slice(0, 5).map((r) => (
                <div key={r.id} className="rounded-lg border border-rose-200 bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{r.test}</p>
                    <StatusBadge status="critical" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"} · {r.value} {r.unit ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reported {formatDate(r.resultDate)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent results */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><Activity className="h-4 w-4" /> Recent results</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "results")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No results published yet.</p>
              ) : [...results]
                  .sort((a, b) => b.resultDate.localeCompare(a.resultDate))
                  .slice(0, 5)
                  .map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{r.test}</p>
                        {r.abnormalIndicator && r.abnormalIndicator !== "normal" ? (
                          <StatusBadge status={r.abnormalIndicator} />
                        ) : (
                          <StatusBadge status="normal" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"} · {r.value} {r.unit ?? ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.resultDate)}</p>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
