"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService } from "@/lib/services";
import type { Appointment, AppointmentStatus } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { CalendarDays, Plus, Video } from "lucide-react";
import { formatDate, formatTime, fullName, initials, relativeDay } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const UPCOMING: AppointmentStatus[] = ["scheduled", "checked_in", "waiting_for_provider", "in_progress", "awaiting_documentation"];
const COMPLETED: AppointmentStatus[] = ["completed"];
const CANCELLED: AppointmentStatus[] = ["cancelled", "no_show"];

type ApptTab = "upcoming" | "completed" | "cancelled";

export function PatientAppointments() {
  const { profile } = usePatientContext();
  const [all, setAll] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ApptTab>("upcoming");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    appointmentService.list({ patientId: profile.id })
      .then((rows) => { if (!cancelled) setAll(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load appointments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const upcoming = useMemo(() => all.filter((a) => UPCOMING.includes(a.status)).sort((a, b) => a.date.localeCompare(b.date)), [all]);
  const completed = useMemo(() => all.filter((a) => COMPLETED.includes(a.status)).sort((a, b) => b.date.localeCompare(a.date)), [all]);
  const cancelled = useMemo(() => all.filter((a) => CANCELLED.includes(a.status)).sort((a, b) => b.date.localeCompare(a.date)), [all]);

  const rows = tab === "upcoming" ? upcoming : tab === "completed" ? completed : cancelled;

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

      <SegmentedControl<ApptTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: "Upcoming", badge: upcoming.length || undefined },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load appointments" description={error} />
      ) : rows.length === 0 ? (
        tab === "upcoming" ? (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming appointments"
            description="Book a consultation with one of our verified doctors."
            action={<Button onClick={() => navigate("patient", "doctors")}>Find a doctor</Button>}
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={tab === "completed" ? "No completed appointments yet" : "No cancelled appointments"}
            description={tab === "completed" ? "Your past consultations will appear here." : "You have a clean record."}
            compact
          />
        )
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {rows.map((a) => (
            <AppointmentRow key={a.id} appt={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({ appt: a }: { appt: Appointment }) {
  const provider = a.provider;
  const isUpcoming = ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status);
  const canJoin = isUpcoming && a.consultationChannel === "video";

  return (
    <CompactListItem
      leading={
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
          </AvatarFallback>
        </Avatar>
      }
      title={provider ? fullName(provider) : "Provider"}
      subtitle={`${provider?.specialty ?? "Consultation"} · ${relativeDay(a.date)}, ${formatDate(a.date)} · ${formatTime(a.time)}`}
      trailing={
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={a.status} size="sm" />
          {canJoin && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); navigate("patient", "consultation", { id: a.id }); }}
            >
              <Video className="h-3 w-3" /> Join
            </Button>
          )}
        </div>
      }
      onClick={() => navigate("patient", "appointment", { id: a.id })}
      chevron
    />
  );
}
