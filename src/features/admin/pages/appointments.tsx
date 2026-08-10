"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService } from "@/lib/services";
import type { Appointment } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { CalendarDays, Search, Filter, Video, MapPin, Phone, MessageSquare, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) + (channelFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        description="Read-only overview of every consultation booked across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Appointments" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total" value={appts.length} icon={CalendarDays} />
        <MetricCard label="Today" value={todaysCount} icon={CalendarDays} tone="info" />
        <MetricCard label="Upcoming" value={upcomingCount} icon={CalendarDays} tone="violet" />
        <MetricCard label="Completed" value={completedCount} icon={CalendarDays} tone="success" />
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Appointment ID, patient, provider…" className="pl-9" />
        </div>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filters" className="relative">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Mobile collapsible filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
        <CollapsibleContent>
          <SectionCard title="Filters" icon={SlidersHorizontal}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
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
                <Label className="text-xs">Channel</Label>
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
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* Desktop inline filters */}
      <div className="hidden lg:block">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
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
        </SectionCard>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments" description="No appointments match your filters." />
      ) : (
        <SectionCard dense>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const ChannelIcon = CHANNEL_ICONS[a.consultationChannel] ?? Video;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="font-medium">{a.id}</p>
                        <p className="text-xs text-muted-foreground">{a.paymentStatus}</p>
                      </TableCell>
                      <TableCell>
                        {a.patient ? (
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{a.patient.firstName} {a.patient.lastName}</span>
                          </span>
                        ) : <span className="text-muted-foreground">{a.patientId}</span>}
                      </TableCell>
                      <TableCell>
                        {a.provider ? (
                          <span className="truncate block">{a.provider.title} {a.provider.firstName} {a.provider.lastName}</span>
                        ) : <span className="text-muted-foreground">{a.providerId}</span>}
                      </TableCell>
                      <TableCell>
                        <p>{formatDate(a.date)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(a.time)} · {a.durationMinutes}m</p>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 capitalize">
                          <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {a.consultationChannel.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(a.price)}</TableCell>
                      <TableCell><StatusBadge status={a.status} size="sm" /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border/60">
            {filtered.map((a) => {
              const ChannelIcon = CHANNEL_ICONS[a.consultationChannel] ?? Video;
              return (
                <li key={a.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : a.patientId}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.provider ? `${a.provider.title} ${a.provider.lastName}` : a.providerId}
                      </p>
                    </div>
                    <StatusBadge status={a.status} size="sm" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 capitalize">
                      <ChannelIcon className="h-3 w-3" /> {a.consultationChannel.replace("_", " ")}
                    </span>
                    <span>{formatDate(a.date)} · {formatTime(a.time)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{a.id}</span>
                    <span className="font-semibold text-sm">{formatCurrency(a.price)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
