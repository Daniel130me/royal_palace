"use client";

import type { AppointmentListScope, AppointmentResponse } from "@royal-palace/contracts";
import { CalendarDays, MessageSquare, Phone, Plus, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { consultationActionLabel } from "@/lib/consultation-policy";
import { formatDate, formatTime, initials, relativeDay } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { schedulingPaymentService } from "@/lib/services";

type AppointmentTab = "upcoming" | "completed" | "unsuccessful";

const TAB_SCOPE: Record<AppointmentTab, AppointmentListScope> = {
  completed: "COMPLETED",
  unsuccessful: "UNSUCCESSFUL",
  upcoming: "UPCOMING",
};

export function PatientAppointments() {
  const [appointments, setAppointments] = useState<AppointmentResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AppointmentTab>("upcoming");
  const requestSequence = useRef(0);

  const load = useCallback(
    async (nextCursor?: string) => {
      const requestId = ++requestSequence.current;
      if (nextCursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await schedulingPaymentService.patientAppointments({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          limit: 25,
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
    [tab],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Appointments"
        description="View and manage your consultations."
        actions={
          <Button size="sm" onClick={() => navigate("patient", "doctors")}>
            <Plus className="h-4 w-4" /> Book new
          </Button>
        }
      />

      <SegmentedControl<AppointmentTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Completed" },
          { value: "unsuccessful", label: "Cancelled" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={
            tab === "upcoming" ? "No upcoming appointments" : "No appointments in this category"
          }
          description={
            tab === "upcoming"
              ? "Book a consultation with a verified practitioner."
              : "Appointments will appear here when available."
          }
          action={
            tab === "upcoming" ? (
              <Button onClick={() => navigate("patient", "doctors")}>Find a practitioner</Button>
            ) : undefined
          }
          compact={tab !== "upcoming"}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
            {appointments.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
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

function AppointmentRow({ appointment }: { appointment: AppointmentResponse }) {
  const channel =
    appointment.mode === "AUDIO" ? "audio" : appointment.mode === "CHAT" ? "chat" : "video";
  const ChannelIcon = channel === "audio" ? Phone : channel === "chat" ? MessageSquare : Video;
  const canJoin = appointment.status === "CONFIRMED" && appointment.mode !== "IN_PERSON";
  return (
    <CompactListItem
      leading={
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(appointment.practitioner.displayName)}
          </AvatarFallback>
        </Avatar>
      }
      title={appointment.practitioner.displayName}
      subtitle={`${relativeDay(appointment.startsAt)}, ${formatDate(appointment.startsAt)} · ${formatTime(appointment.startsAt)} · ${appointment.mode.replaceAll("_", " ").toLowerCase()}`}
      trailing={
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={appointment.status.toLowerCase()} size="sm" />
          {canJoin && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                navigate("patient", "consultation", { id: appointment.id });
              }}
            >
              <ChannelIcon className="h-3 w-3" /> {consultationActionLabel(channel)}
            </Button>
          )}
        </div>
      }
      onClick={() => navigate("patient", "appointment", { id: appointment.id })}
      chevron
    />
  );
}
