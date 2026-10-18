"use client";

import type { AppointmentListScope, ProviderAppointmentResponse } from "@royal-palace/contracts";
import { CalendarDays, FileText, MessageSquare, Phone, Search, User, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime, initials, relativeDay } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { encounterService, schedulingPaymentService } from "@/lib/services";

type Tab = "today" | "upcoming" | "completed" | "all";

const TAB_SCOPE: Record<Tab, AppointmentListScope> = {
  all: "ALL",
  completed: "COMPLETED",
  today: "TODAY",
  upcoming: "UPCOMING",
};

export function ProviderAppointments() {
  const [appointments, setAppointments] = useState<ProviderAppointmentResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (nextCursor?: string) => {
      const requestId = ++requestSequence.current;
      if (nextCursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const day = tab === "today" ? localDayBounds() : undefined;
        const page = await schedulingPaymentService.providerAppointments({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          ...(day === undefined ? {} : day),
          limit: 25,
          ...(query.length >= 2 ? { q: query } : {}),
          scope: TAB_SCOPE[tab],
        });
        if (requestId !== requestSequence.current) return;
        setAppointments((current) =>
          nextCursor === undefined ? [...page.data] : [...current, ...page.data],
        );
        setCursor(page.pageInfo.endCursor);
      } catch (reason) {
        if (requestId !== requestSequence.current) return;
        setError(reason instanceof Error ? reason.message : "Appointments could not be loaded");
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, tab],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function startConsultation(appointmentId: string) {
    setStartingId(appointmentId);
    try {
      const encounter = await encounterService.start(appointmentId, "");
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: encounter.id });
    } catch (reason) {
      toast.error(
        `Could not start consultation: ${reason instanceof Error ? reason.message : "Unknown error"}`,
      );
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        description="All consultations booked with you, across every channel."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search patient or appointment ID…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
      />

      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Done" },
          { value: "all", label: "All" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={tab === "completed" ? FileText : CalendarDays}
          title={tab === "today" ? "No appointments today" : "No appointments found"}
          description={
            query.length >= 2
              ? "No appointment matches your search."
              : "Appointments will appear here when available."
          }
          compact
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
            {appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                starting={startingId === appointment.id}
                onStart={() => void startConsultation(appointment.id)}
              />
            ))}
          </div>
          {cursor !== null && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={loadingMore} onClick={() => void load(cursor)}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  onStart,
  starting,
}: {
  appointment: ProviderAppointmentResponse;
  onStart: () => void;
  starting: boolean;
}) {
  const Icon =
    appointment.mode === "VIDEO"
      ? Video
      : appointment.mode === "AUDIO"
        ? Phone
        : appointment.mode === "CHAT"
          ? MessageSquare
          : User;
  const durationMinutes = Math.round(
    (Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000,
  );
  return (
    <CompactListItem
      leading={
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(appointment.patient.displayName)}
          </AvatarFallback>
        </Avatar>
      }
      title={`${formatTime(appointment.startsAt)} · ${appointment.patient.displayName}`}
      subtitle={`${relativeDay(appointment.startsAt)} · ${durationMinutes} min · ${appointment.mode.replaceAll("_", " ").toLowerCase()}`}
      onClick={() => navigate("provider", "appointment", { id: appointment.id })}
      trailing={
        <div className="flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <StatusBadge status={appointment.status.toLowerCase()} size="sm" />
          {appointment.status === "CONFIRMED" && (
            <Button
              size="sm"
              className="h-7 px-2.5"
              disabled={starting}
              onClick={(event) => {
                event.stopPropagation();
                onStart();
              }}
            >
              {starting ? "Starting…" : "Start"}
            </Button>
          )}
        </div>
      }
      chevron
    />
  );
}

function localDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { dayFrom: start.toISOString(), dayTo: end.toISOString() };
}
