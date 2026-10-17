"use client";

import type {
  AdminAppointmentListItem,
  AdminAppointmentScope,
  AdminAppointmentSummary,
} from "@royal-palace/contracts";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  Search,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMinorCurrency, formatTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService } from "@/lib/services";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AUDIO: Phone,
  CHAT: MessageSquare,
  VIDEO: Video,
};
const EMPTY_SUMMARY: AdminAppointmentSummary = {
  all: 0,
  completed: 0,
  today: 0,
  unsuccessful: 0,
  upcoming: 0,
};

export function AdminAppointments() {
  const [appointments, setAppointments] = useState<readonly AdminAppointmentListItem[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scope, setScope] = useState<AdminAppointmentScope>("ALL");
  const dayRange = useMemo(() => localDayRange(), []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const load = useCallback(
    async (nextCursor?: string) => {
      if (nextCursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await administrationService.appointments({
          cursor: nextCursor,
          dayFrom: dayRange.from,
          dayTo: dayRange.to,
          limit: 25,
          query: debouncedSearch || undefined,
          scope,
        });
        setAppointments((current) =>
          nextCursor === undefined ? response.data : [...current, ...response.data],
        );
        setSummary(response.summary);
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load appointments");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [dayRange, debouncedSearch, scope],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null && appointments.length === 0)
    return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        description="Read-only, privacy-minimized oversight of every consultation booked."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Appointments" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Total" value={summary.all} icon={CalendarDays} />
        <StatTile label="Today" value={summary.today} icon={Clock} tone="info" />
        <StatTile label="Upcoming" value={summary.upcoming} icon={CalendarDays} tone="violet" />
        <StatTile label="Completed" value={summary.completed} icon={CheckCircle2} tone="success" />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Appointment ID, patient, provider…"
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={[
          { value: "ALL" as const, label: "All", badge: summary.all },
          { value: "TODAY" as const, label: "Today", badge: summary.today },
          { value: "UPCOMING" as const, label: "Upcoming", badge: summary.upcoming },
          { value: "COMPLETED" as const, label: "Done", badge: summary.completed },
          { value: "UNSUCCESSFUL" as const, label: "Unsuccessful", badge: summary.unsuccessful },
        ]}
        value={scope}
        onChange={setScope}
        size="sm"
      />
      {error !== null && <ErrorState message={error} onRetry={() => void load()} />}
      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No appointments"
          description="No appointments match your filters."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {appointments.map((appointment) => {
            const ChannelIcon = CHANNEL_ICONS[appointment.mode] ?? Video;
            const unsuccessful = ["CANCELLED", "EXPIRED", "PAYMENT_FAILED"].includes(
              appointment.status,
            );
            const isToday =
              appointment.startsAt >= dayRange.from && appointment.startsAt < dayRange.to;
            return (
              <CompactListItem
                key={appointment.id}
                leading={
                  <div
                    className={cn(
                      "rounded-lg p-2 ring-1",
                      appointment.status === "COMPLETED"
                        ? "bg-emerald-50 ring-emerald-100"
                        : unsuccessful
                          ? "bg-rose-50 ring-rose-100"
                          : isToday
                            ? "bg-sky-50 ring-sky-100"
                            : "bg-muted ring-border",
                    )}
                  >
                    <ChannelIcon
                      className={cn(
                        "h-4 w-4",
                        appointment.status === "COMPLETED"
                          ? "text-emerald-600"
                          : unsuccessful
                            ? "text-rose-600"
                            : isToday
                              ? "text-sky-600"
                              : "text-muted-foreground",
                      )}
                    />
                  </div>
                }
                title={`${appointment.patient.displayName} · ${appointment.practitioner.displayName}`}
                subtitle={`${formatDate(appointment.startsAt)} · ${formatTime(appointment.startsAt)} · ${appointment.mode.replaceAll("_", " ").toLowerCase()} · ${appointment.id}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMinorCurrency(appointment.amountMinor, appointment.currency)}
                    </span>
                    <StatusBadge status={appointment.status.toLowerCase()} size="sm" />
                  </div>
                }
              />
            );
          })}
        </div>
      )}
      {hasNextPage && cursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void load(cursor)} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function localDayRange(): { from: string; to: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
