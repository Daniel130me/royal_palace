"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, encounterService } from "@/lib/services";
import { intakeReason } from "./dashboard";
import type { Appointment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDate, formatTime, relativeDay, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, Search, FileText, Video, Phone, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";

function channelIcon(channel: string) {
  if (channel === "video") return Video;
  if (channel === "audio") return Phone;
  if (channel === "chat") return MessageSquare;
  return User;
}

type Tab = "today" | "upcoming" | "completed" | "all";

export function ProviderAppointments() {
  const { providerId } = useProviderContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const appts = await appointmentService.list({ providerId });
      setAppointments(appts);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = (a: Appointment) => {
      if (!term) return true;
      const name = a.patient ? `${a.patient.firstName} ${a.patient.lastName}`.toLowerCase() : "";
      const reason = intakeReason(a).toLowerCase();
      return name.includes(term) || reason.includes(term) || a.id.toLowerCase().includes(term);
    };
    return appointments.filter(matches);
  }, [appointments, q]);

  const todays = useMemo(
    () => filtered.filter((a) => a.date === today).sort((a, b) => a.time.localeCompare(b.time)),
    [filtered, today]
  );
  const upcoming = useMemo(
    () => filtered.filter((a) => a.date > today && ["scheduled"].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [filtered, today]
  );
  const completed = useMemo(
    () => filtered.filter((a) => ["completed", "no_show", "cancelled"].includes(a.status)).sort((a, b) => (b.date + b.time).localeCompare(a.date + b.time)),
    [filtered]
  );

  const current = tab === "today" ? todays : tab === "upcoming" ? upcoming : tab === "completed" ? completed : filtered;

  async function startConsultation(appt: Appointment) {
    if (!providerId) return;
    setStartingId(appt.id);
    try {
      const enc = await encounterService.start(appt.id, providerId);
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: enc.id });
    } catch (e) {
      toast.error("Could not start consultation: " + (e as Error).message);
    } finally {
      setStartingId(null);
    }
  }

  function Row({ a }: { a: Appointment }) {
    const Icon = channelIcon(a.consultationChannel);
    return (
      <CompactListItem
        leading={
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {a.patient ? initials(fullName(a.patient)) : "?"}
            </AvatarFallback>
          </Avatar>
        }
        title={`${formatTime(a.time)} · ${a.patient ? fullName(a.patient) : "Patient"}`}
        subtitle={`${relativeDay(a.date)} · ${a.durationMinutes}min · ${intakeReason(a)} · ${a.consultationChannel.replace(/_/g, " ")}`}
        onClick={() => navigate("provider", "appointment", { id: a.id })}
        trailing={
          <div className="flex items-center gap-1.5">
            <StatusBadge status={a.status} size="sm" />
            {["scheduled", "checked_in", "waiting_for_provider"].includes(a.status) ? (
              <Button
                size="sm"
                className="h-7 px-2.5"
                disabled={startingId === a.id}
                onClick={(e) => { e.stopPropagation(); startConsultation(a); }}
              >
                {startingId === a.id ? "…" : "Start"}
              </Button>
            ) : a.status === "in_progress" && a.encounter ? (
              <Button
                size="sm"
                className="h-7 px-2.5"
                onClick={(e) => { e.stopPropagation(); navigate("provider", "encounter", { id: a.encounter!.id }); }}
              >
                Continue
              </Button>
            ) : null}
          </div>
        }
        chevron
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Appointments" description="All consultations booked with you, across every channel." />
        <div className="h-9 w-72 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="All consultations booked with you, across every channel."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search patient, reason, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-2">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "today", label: "Today", badge: todays.length },
            { value: "upcoming", label: "Upcoming", badge: upcoming.length },
            { value: "completed", label: "Done", badge: completed.length },
            { value: "all", label: "All", badge: filtered.length },
          ]}
        />
      </div>

      {current.length === 0 ? (
        <EmptyState
          icon={tab === "completed" ? FileText : CalendarDays}
          title={
            tab === "today" ? "No appointments today" :
            tab === "upcoming" ? "No upcoming appointments" :
            tab === "completed" ? "No completed appointments yet" :
            "No appointments"
          }
          description={
            tab === "today" ? "Your schedule is clear." :
            tab === "upcoming" ? "New bookings will appear here." :
            tab === "completed" ? "Finished consultations will be archived here." :
            "No appointments match your search."
          }
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {current.map((a) => <Row key={a.id} a={a} />)}
        </div>
      )}

      <div className={cn("mt-4 rounded-xl bg-muted/30 border border-dashed border-border/60 p-3 text-xs text-muted-foreground")}>
        <p className="font-medium text-foreground mb-0.5">Consultation channels</p>
        <p className="leading-relaxed">Video, audio, in-person and chat consultations are all supported. Tap <strong>Start</strong> when the patient is ready to begin the clinical encounter. The encounter workspace autosaves your SOAP notes as you type.</p>
      </div>
    </div>
  );
}
