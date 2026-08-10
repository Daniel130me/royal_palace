"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, encounterService } from "@/lib/services";
import { intakeReason } from "./dashboard";
import type { Appointment } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, formatTime, relativeDay, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, Search, Stethoscope, FileText, Video, Phone, MessageSquare, User } from "lucide-react";

function channelIcon(channel: string) {
  if (channel === "video") return Video;
  if (channel === "audio") return Phone;
  if (channel === "chat") return MessageSquare;
  return User;
}

export function ProviderAppointments() {
  const { providerId } = useProviderContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

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
    () => filtered.filter((a) => ["completed", "no_show", "cancelled"].includes(a.status)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [filtered]
  );

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
      <Card className="hover:shadow-soft-md transition-shadow">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {a.patient ? initials(fullName(a.patient)) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {a.patient ? fullName(a.patient) : "Patient"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {relativeDay(a.date)} · {formatTime(a.time)} · {a.durationMinutes}min · {intakeReason(a)}
                </span>
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <StatusBadge status={a.status} size="sm" />
                <StatusBadge status={a.paymentStatus} size="sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {a.status === "in_progress" && a.encounter ? (
                <Button size="sm" onClick={() => navigate("provider", "encounter", { id: a.encounter!.id })}>
                  Continue
                </Button>
              ) : null}
              {["scheduled", "checked_in", "waiting_for_provider"].includes(a.status) ? (
                <Button size="sm" disabled={startingId === a.id} onClick={() => startConsultation(a)}>
                  {startingId === a.id ? "Starting…" : "Start"}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => navigate("provider", "appointment", { id: a.id })}>
                View
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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

      <Tabs defaultValue="today">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="mb-4">
            <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="today" className="space-y-3">
          {todays.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No appointments today" description="Your schedule is clear." compact />
          ) : (
            todays.map((a) => <Row key={a.id} a={a} />)
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3">
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No upcoming appointments" description="New bookings will appear here." compact />
          ) : (
            upcoming.map((a) => <Row key={a.id} a={a} />)
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completed.length === 0 ? (
            <EmptyState icon={FileText} title="No completed appointments yet" description="Finished consultations will be archived here." compact />
          ) : (
            completed.map((a) => <Row key={a.id} a={a} />)
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {filtered.length === 0 ? (
            <EmptyState icon={Stethoscope} title="No appointments" description="No appointments match your search." compact />
          ) : (
            filtered.map((a) => <Row key={a.id} a={a} />)
          )}
        </TabsContent>
      </Tabs>

      <Card className="mt-6 bg-muted/30 border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Consultation channels</p>
          <p className="leading-relaxed">Video, audio, in-person and chat consultations are all supported. Tap <strong>Start</strong> when the patient is ready to begin the clinical encounter. The encounter workspace autosaves your SOAP notes as you type.</p>
        </CardContent>
      </Card>
    </div>
  );
}
