"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService } from "@/lib/services";
import type { Appointment } from "@/types";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { CalendarDays, Search, Video, MapPin, Phone, MessageSquare, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Phone,
  in_person: MapPin,
  chat: MessageSquare,
};

type StatusFilter = "all" | "today" | "upcoming" | "completed" | "cancelled";

export function AdminAppointments() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = () => {
    setLoading(true);
    setError(null);
    appointmentService.list()
      .then(setAppts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  const counts = useMemo(() => ({
    all: appts.length,
    today: appts.filter((a) => a.date === todayStr).length,
    upcoming: appts.filter((a) => ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status)).length,
    completed: appts.filter((a) => a.status === "completed").length,
    cancelled: appts.filter((a) => ["cancelled", "no_show"].includes(a.status)).length,
  }), [appts, todayStr]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appts
      .filter((a) => {
        if (filter === "today" && a.date !== todayStr) return false;
        if (filter === "upcoming" && !["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status)) return false;
        if (filter === "completed" && a.status !== "completed") return false;
        if (filter === "cancelled" && !["cancelled", "no_show"].includes(a.status)) return false;
        if (!q) return true;
        const providerName = a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : "";
        const patientName = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "";
        return `${a.id} ${a.providerId} ${a.patientId} ${providerName} ${patientName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [appts, search, filter, todayStr]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        description="Read-only overview of every consultation booked."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Appointments" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total" value={counts.all} icon={CalendarDays} />
        <StatTile label="Today" value={counts.today} icon={Clock} tone="info" />
        <StatTile label="Upcoming" value={counts.upcoming} icon={CalendarDays} tone="violet" />
        <StatTile label="Completed" value={counts.completed} icon={CheckCircle2} tone="success" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Appointment ID, patient, provider…" className="pl-9" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "today" as StatusFilter, label: "Today", badge: counts.today },
          { value: "upcoming" as StatusFilter, label: "Upcoming", badge: counts.upcoming },
          { value: "completed" as StatusFilter, label: "Done", badge: counts.completed },
          { value: "cancelled" as StatusFilter, label: "Cancelled", badge: counts.cancelled },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments" description="No appointments match your filters." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((a) => {
            const ChannelIcon = CHANNEL_ICONS[a.consultationChannel] ?? Video;
            const patientName = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : a.patientId;
            const providerName = a.provider ? `${a.provider.title} ${a.provider.lastName}` : a.providerId;
            return (
              <CompactListItem
                key={a.id}
                leading={
                  <div className={cn("rounded-lg p-2 ring-1",
                    a.status === "completed" ? "bg-emerald-50 ring-emerald-100" :
                    ["cancelled", "no_show"].includes(a.status) ? "bg-rose-50 ring-rose-100" :
                    a.date === todayStr ? "bg-sky-50 ring-sky-100" : "bg-muted ring-border"
                  )}>
                    <ChannelIcon className={cn("h-4 w-4",
                      a.status === "completed" ? "text-emerald-600" :
                      ["cancelled", "no_show"].includes(a.status) ? "text-rose-600" :
                      a.date === todayStr ? "text-sky-600" : "text-muted-foreground"
                    )} />
                  </div>
                }
                title={`${patientName} · ${providerName}`}
                subtitle={`${formatDate(a.date)} · ${formatTime(a.time)} · ${a.consultationChannel.replace("_", " ")} · ${a.id}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(a.price)}</span>
                    <StatusBadge status={a.status} size="sm" />
                  </div>
                }
                onClick={undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
