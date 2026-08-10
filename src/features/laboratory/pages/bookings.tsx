"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { laboratoryService, labRequestService } from "@/lib/services";
import type { LaboratoryBooking } from "@/types";
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState, ErrorState } from "@/components/healthcare/states";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatTime, relativeDay, nextLabStatuses } from "@/lib/format";
import {
  CalendarClock, Search, ArrowRight, FileCheck2, MapPin, Home, Building2,
} from "lucide-react";

type TabKey = "today" | "active" | "awaiting" | "completed" | "all";

const COMPLETED_STATUSES = ["completed", "result_published"];
const TERMINAL_STATUSES = [...COMPLETED_STATUSES, "cancelled"];

export function LabBookings() {
  const { labId, reload } = useLabContext();
  const [bookings, setBookings] = useState<LaboratoryBooking[]>([]);
  const [results, setResults] = useState<{ bookingId?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("active");
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

  const todayStr = new Date().toISOString().slice(0, 10);

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [bookings]
  );
  const today = sorted.filter((b) => b.date === todayStr && !TERMINAL_STATUSES.includes(b.status));
  const active = sorted.filter((b) => !TERMINAL_STATUSES.includes(b.status));
  const awaiting = sorted.filter((b) => b.status === "quality_review" || (b.status === "completed" && !results.some((r) => r.bookingId === b.id)));
  const completed = sorted.filter((b) => TERMINAL_STATUSES.includes(b.status));

  const visible = useMemo(() => {
    const base = tab === "today" ? today : tab === "active" ? active : tab === "awaiting" ? awaiting : tab === "completed" ? completed : sorted;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((b) =>
      b.bookingNumber.toLowerCase().includes(q) ||
      (b.patient && `${b.patient.firstName} ${b.patient.lastName}`.toLowerCase().includes(q)) ||
      (b.request?.tests?.join(" ").toLowerCase().includes(q)) ||
      (b.request?.requestNumber.toLowerCase().includes(q))
    );
  }, [tab, query, sorted, today, active, awaiting, completed]);

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

  if (loading) return <LoadingState label="Loading bookings…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Sample collections and tests in progress at your laboratory."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mb-4">
        <TabsList>
          <TabsTrigger value="today">Today ({today.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="awaiting">Awaiting upload ({awaiting.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          <TabsTrigger value="all">All ({sorted.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by booking number, patient or test…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No bookings"
          description={tab === "today" ? "No bookings scheduled for today." : "No bookings match this filter."}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((b) => {
            const nextStatuses = nextLabStatuses(b.status);
            const hasResult = results.some((r) => r.bookingId === b.id);
            return (
              <Card key={b.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{b.bookingNumber}</span>
                        <StatusBadge status={b.status} />
                        <span className="text-xs text-muted-foreground">· {relativeDay(b.date)} at {formatTime(b.time)}</span>
                        {b.collectionMode === "home" ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded-md px-2 py-0.5">
                            <Home className="h-3 w-3" /> Home
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-sky-100 text-sky-700 border border-sky-200 rounded-md px-2 py-0.5">
                            <Building2 className="h-3 w-3" /> Facility
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">
                        {b.request?.tests?.join(", ") ?? "Laboratory tests"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {b.patient ? `${b.patient.firstName} ${b.patient.lastName}` : "Patient"}
                        {b.request ? ` · ${b.request.requestNumber}` : ""}
                        {" · "}{formatCurrency(b.price)}
                      </p>
                      {b.collectionMode === "home" && b.homeAddress && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {b.homeAddress}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0 sm:w-56">
                      {b.status !== "result_published" && b.status !== "cancelled" && (
                        <>
                          {nextStatuses.map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              disabled={progressing === b.id}
                              onClick={() => handleProgress(b, s)}
                            >
                              {humanise(s)}
                              <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          ))}
                          {b.status === "quality_review" && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => navigate("laboratory", "result-new", {
                                bookingId: b.id,
                                requestId: b.requestId,
                              })}
                            >
                              <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Upload result
                            </Button>
                          )}
                          {b.status === "completed" && !hasResult && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => navigate("laboratory", "result-new", {
                                bookingId: b.id,
                                requestId: b.requestId,
                              })}
                            >
                              <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Upload result
                            </Button>
                          )}
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "request", { id: b.requestId })}>
                        View request
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
