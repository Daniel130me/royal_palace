"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService } from "@/lib/services";
import type { Appointment } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { CalendarDays, Search, Filter, Video, MapPin, Phone, MessageSquare, User } from "lucide-react";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Phone,
  in_person: MapPin,
  chat: MessageSquare,
};

export function AdminAppointments() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  const load = () => {
    setLoading(true);
    setError(null);
    appointmentService.list()
      .then(setAppts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const channels = useMemo(() => {
    const set = new Set(appts.map((a) => a.consultationChannel));
    return Array.from(set).sort();
  }, [appts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appts
      .filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (channelFilter !== "all" && a.consultationChannel !== channelFilter) return false;
        if (!q) return true;
        const providerName = a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : "";
        const patientName = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "";
        return `${a.id} ${a.providerId} ${a.patientId} ${providerName} ${patientName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [appts, search, statusFilter, channelFilter]);

  const todaysCount = appts.filter((a) => a.date === new Date().toISOString().slice(0, 10)).length;
  const completedCount = appts.filter((a) => a.status === "completed").length;
  const upcomingCount = appts.filter((a) => ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status)).length;

  if (loading) return <LoadingState label="Loading appointments…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Read-only overview of every consultation booked across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Appointments" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total" value={appts.length} icon={CalendarDays} />
        <MetricCard label="Today" value={todaysCount} icon={CalendarDays} tone="info" />
        <MetricCard label="Upcoming" value={upcomingCount} icon={CalendarDays} tone="info" />
        <MetricCard label="Completed" value={completedCount} icon={CalendarDays} tone="success" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Appointment ID, patient, provider…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="checked_in">Checked in</SelectItem>
                  <SelectItem value="waiting_for_provider">Waiting</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no_show">No-show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Channel</Label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  {channels.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments" description="No appointments match your filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Appointment</th>
                  <th className="text-left p-3">Patient</th>
                  <th className="text-left p-3">Provider</th>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Channel</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((a) => {
                  const ChannelIcon = CHANNEL_ICONS[a.consultationChannel] ?? Video;
                  return (
                    <tr key={a.id} className="hover:bg-accent/40">
                      <td className="p-3">
                        <p className="font-medium">{a.id}</p>
                        <p className="text-xs text-muted-foreground">{a.paymentStatus}</p>
                      </td>
                      <td className="p-3">
                        {a.patient ? (
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{a.patient.firstName} {a.patient.lastName}</span>
                          </span>
                        ) : <span className="text-muted-foreground">{a.patientId}</span>}
                      </td>
                      <td className="p-3">
                        {a.provider ? (
                          <span className="truncate block">{a.provider.title} {a.provider.firstName} {a.provider.lastName}</span>
                        ) : <span className="text-muted-foreground">{a.providerId}</span>}
                      </td>
                      <td className="p-3">
                        <p>{formatDate(a.date)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(a.time)} · {a.durationMinutes}m</p>
                      </td>
                      <td className="p-3">
                        <span className="flex items-center gap-1 capitalize">
                          <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {a.consultationChannel.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{formatCurrency(a.price)}</td>
                      <td className="p-3"><StatusBadge status={a.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
