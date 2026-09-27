"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import {
  appointmentService,
  encounterService,
  labRequestService,
  referralService,
  settlementService,
} from "@/lib/services";
import { resource } from "@/lib/api-client";
import {
  normalizeEncounter,
  normalizeLabRequest,
  normalizeReferral,
} from "../normalize";
import type {
  Appointment,
  ClinicalEncounter,
  LaboratoryRequest,
  Referral,
  Settlement,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  SkeletonGrid,
  ErrorState,
} from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, relativeDay, formatTime, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarDays, Users, FileText, FlaskConical, Share2, Wallet,
  Stethoscope, AlertTriangle, ArrowRight, CheckCircle2, BadgeCheck,
  Video, Phone, MessageSquare, User, ChevronRight, PlayCircle, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function intakeReason(a: Appointment): string {
  const intake = a.intakeForm as unknown;
  if (intake && typeof intake === "object") {
    const r = (intake as Record<string, unknown>).reason;
    if (typeof r === "string" && r) return r;
  }
  if (typeof intake === "string") {
    try {
      const parsed = JSON.parse(intake) as Record<string, unknown>;
      if (typeof parsed.reason === "string") return parsed.reason;
    } catch {
      /* ignore */
    }
  }
  return "—";
}

export function channelIcon(channel: string) {
  if (channel === "video") return Video;
  if (channel === "audio") return Phone;
  if (channel === "chat") return MessageSquare;
  return User;
}

const QUICK_ACTIONS = [
  { label: "Appointments", icon: CalendarDays, page: "appointments", tone: "bg-sky-50 text-sky-700 ring-sky-100" },
  { label: "Patients", icon: Users, page: "patients", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  { label: "Lab results", icon: FlaskConical, page: "results", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  { label: "Referrals", icon: Share2, page: "referrals", tone: "bg-amber-50 text-amber-700 ring-amber-100" },
];

export function ProviderDashboard() {
  const { sessionName } = useNav();
  const { profile, providerId, loading: profileLoading } = useProviderContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const [appts, encs, labs, refs, stls] = await Promise.all([
        appointmentService.list({ providerId }),
        resource.list<ClinicalEncounter>("clinicalEncounter", { providerId }),
        labRequestService.list({ requestingProviderId: providerId }),
        referralService.list({ recipientProviderId: providerId }),
        settlementService.list({ entityType: "provider", entityId: providerId }),
      ]);
      setAppointments(appts);
      setEncounters(encs.map(normalizeEncounter));
      setLabRequests(labs.map(normalizeLabRequest));
      setReferrals(refs.map(normalizeReferral));
      setSettlements(stls);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const todaysAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.date === today)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today]
  );

  const waitingPatients = useMemo(
    () => appointments.filter((a) => a.status === "waiting_for_provider" || a.status === "checked_in"),
    [appointments]
  );

  const pendingDocumentation = useMemo(
    () => encounters.filter((e) => e.status === "open"),
    [encounters]
  );

  const labResultsToReview = useMemo(
    () => labRequests.filter((l) => l.status === "completed" && l.result && !l.result.reviewer),
    [labRequests]
  );

  const openReferrals = useMemo(
    () => referrals.filter((r) => ["sent", "received", "requires_clarification"].includes(r.status)),
    [referrals]
  );

  const followUps = useMemo(
    () =>
      appointments
        .filter((a) => a.status === "scheduled" && a.date > today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3),
    [appointments, today]
  );

  const todayEarnings = useMemo(() => {
    const todaysCompleted = appointments.filter(
      (a) => a.date === today && a.status === "completed" && a.paymentStatus === "paid"
    );
    return todaysCompleted.reduce((sum, a) => sum + Math.round(a.price * 0.73), 0);
  }, [appointments, today]);

  const settlementTotal = useMemo(
    () => settlements.reduce((s, x) => s + (x.status === "paid" ? x.netAmount : 0), 0),
    [settlements]
  );

  const licenceDays = profile ? daysUntil(profile.licenceExpiry) : null;

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

  if (profileLoading || loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-32 bg-muted/40 animate-pulse rounded-2xl" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <ErrorState message="Provider profile not found." />;

  const firstName = profile.firstName || sessionName.split(" ")[0];

  // Hero: first appointment today with a "Start" path, OR fallback CTA
  const heroAppt = todaysAppointments[0];
  const actionNeeded = [
    ...waitingPatients.slice(0, 2).map((a) => ({
      id: a.id,
      icon: <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"><Users className="h-4 w-4 text-amber-600" /></div>,
      title: `${a.patient ? fullName(a.patient) : "Patient"} is waiting`,
      subtitle: `${formatTime(a.time)} · ${intakeReason(a)}`,
      badge: <StatusBadge status={a.status} size="sm" />,
      onClick: () => startConsultation(a),
    })),
    ...pendingDocumentation.slice(0, 2).map((e) => ({
      id: e.id,
      icon: <div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100"><FileText className="h-4 w-4 text-violet-600" /></div>,
      title: `${e.patient ? fullName(e.patient) : "Patient"} · ${e.encounterNumber}`,
      subtitle: `Open encounter · started ${formatDate(e.createdAt)}`,
      badge: <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]">open</Badge>,
      onClick: () => navigate("provider", "encounter", { id: e.id }),
    })),
    ...labResultsToReview.slice(0, 2).map((l) => ({
      id: l.id,
      icon: <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100"><FlaskConical className="h-4 w-4 text-rose-600" /></div>,
      title: `${l.result?.test ?? l.tests.join(", ")}`,
      subtitle: `${l.patient ? fullName(l.patient) : "Patient"} · ${l.result?.value} ${l.result?.unit}`,
      badge: l.result?.abnormalIndicator && l.result.abnormalIndicator !== "normal"
        ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 capitalize h-5 text-[10px]">{l.result.abnormalIndicator}</Badge>
        : <Badge variant="outline" className="h-5 text-[10px]">unreviewed</Badge>,
      onClick: () => navigate("provider", "results", { id: l.result?.id ?? "" }),
    })),
  ].slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Greeting + verification status */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">{profile.title} {firstName} 👋</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.specialty} · {profile.city}, {profile.state}</p>
        </div>
        {profile.verificationStatus === "approved" ? (
          <button
            onClick={() => navigate("provider", "verification")}
            className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 tap-highlight-none active:scale-[0.98]"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Verified</span>
          </button>
        ) : (
          <button
            onClick={() => navigate("provider", "verification")}
            className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 tap-highlight-none active:scale-[0.98]"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-medium text-amber-700 capitalize">{profile.verificationStatus.replace(/_/g, " ")}</span>
          </button>
        )}
      </div>

      {/* Licence expiry warning (compact) */}
      {licenceDays !== null && licenceDays < 90 && (
        <button
          onClick={() => navigate("provider", "verification")}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left tap-highlight-none active:scale-[0.99]"
        >
          <div className="rounded-xl bg-amber-100 p-2 shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 truncate">
              Licence expires {relativeDay(profile.licenceExpiry)}
            </p>
            <p className="text-xs text-amber-700 truncate">
              MDCN {profile.licenceNumber} · initiate revalidation to avoid suspension.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />
        </button>
      )}

      {/* Hero: next appointment today with Start CTA (or empty CTA) */}
      {heroAppt ? (
        (() => {
          const ChannelIcon = channelIcon(heroAppt.consultationChannel);
          return (
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Next consultation · {relativeDay(heroAppt.date)}</span>
                <StatusBadge status={heroAppt.status} size="sm" />
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {heroAppt.patient ? initials(fullName(heroAppt.patient)) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {formatTime(heroAppt.time)} · {heroAppt.patient ? fullName(heroAppt.patient) : "Patient"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                    <ChannelIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{intakeReason(heroAppt)} · {heroAppt.consultationChannel.replace(/_/g, " ")}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {["scheduled", "checked_in", "waiting_for_provider"].includes(heroAppt.status) && (
                  <Button size="sm" className="flex-1" disabled={startingId === heroAppt.id} onClick={() => startConsultation(heroAppt)}>
                    <PlayCircle className="h-4 w-4 mr-1" /> {startingId === heroAppt.id ? "Starting…" : "Start consultation"}
                  </Button>
                )}
                {heroAppt.status === "in_progress" && heroAppt.encounter && (
                  <Button size="sm" className="flex-1" onClick={() => navigate("provider", "encounter", { id: heroAppt.encounter!.id })}>
                    <Stethoscope className="h-4 w-4 mr-1" /> Continue documentation
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => navigate("provider", "appointment", { id: heroAppt.id })}>
                  Details
                </Button>
              </div>
            </div>
          );
        })()
      ) : (
        <button
          onClick={() => navigate("provider", "appointments")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">No consultations today</p>
              <p className="text-xl font-bold mt-1">View schedule</p>
              <p className="text-xs text-emerald-100/80 mt-1">Check upcoming appointments & follow-ups</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2.5">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={() => navigate("provider", a.page as any)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-border hover:shadow-soft tap-highlight-none active:scale-[0.97]"
            >
              <div className={cn("rounded-xl p-2 ring-1", a.tone)}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium leading-tight text-center">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stat tiles row — tappable */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Today" value={todaysAppointments.length} icon={CalendarDays} tone="info" onClick={() => navigate("provider", "appointments")} />
        <StatTile label="Pending docs" value={pendingDocumentation.length} icon={FileText} tone={pendingDocumentation.length > 0 ? "warning" : "success"} onClick={() => navigate("provider", "appointments")} />
        <StatTile label="Lab review" value={labResultsToReview.length} icon={FlaskConical} tone={labResultsToReview.length > 0 ? "danger" : "success"} onClick={() => navigate("provider", "results")} />
        <StatTile label="Referrals" value={openReferrals.length} icon={Share2} tone="info" onClick={() => navigate("provider", "referrals")} />
      </div>

      {/* MiniMetrics — earnings summary */}
      <div className="grid grid-cols-3 gap-2.5">
        <MiniMetric label="Today's earnings" value={formatCurrency(todayEarnings)} tone="success" />
        <MiniMetric label="Settled total" value={formatCurrency(settlementTotal)} tone="info" />
        <MiniMetric label="Follow-ups" value={followUps.length} tone="default" />
      </div>

      {/* Action needed — compact list */}
      {actionNeeded.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Action needed</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {actionNeeded.map((a) => (
              <CompactListItem
                key={a.id}
                leading={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                trailing={a.badge}
                onClick={a.onClick}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* Right-column content rendered below on mobile, side-by-side on desktop */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* Upcoming follow-ups */}
        <SectionCard
          title="Upcoming follow-ups"
          icon={Clock}
          action={<Button variant="ghost" size="sm" onClick={() => navigate("provider", "appointments")}>View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>}
        >
          {followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No upcoming follow-ups.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {followUps.map((a) => (
                <CompactListItem
                  key={a.id}
                  leading={<div className="rounded-lg bg-primary/10 p-1.5"><Clock className="h-4 w-4 text-primary" /></div>}
                  title={a.patient ? fullName(a.patient) : "Patient"}
                  subtitle={`${relativeDay(a.date)} · ${formatTime(a.time)}`}
                  trailing={<StatusBadge status={a.status} size="sm" />}
                  onClick={() => navigate("provider", "appointment", { id: a.id })}
                  chevron
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Incoming referrals */}
        <SectionCard
          title="Incoming referrals"
          icon={Share2}
          action={openReferrals.length > 0 ? <Badge variant="secondary" className="h-6 bg-amber-100 text-amber-700 border-amber-200">{openReferrals.length}</Badge> : undefined}
        >
          {openReferrals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No incoming referrals.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {openReferrals.slice(0, 3).map((r) => (
                <CompactListItem
                  key={r.id}
                  leading={<div className="rounded-lg bg-amber-50 p-1.5"><Share2 className="h-4 w-4 text-amber-600" /></div>}
                  title={r.reason}
                  subtitle={`From ${r.sender ? `${r.sender.title} ${r.sender.lastName}` : "Provider"} · ${r.patient ? fullName(r.patient) : ""}`}
                  trailing={<StatusBadge status={r.status} size="sm" />}
                  onClick={() => navigate("provider", "referrals")}
                  chevron
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Verification mini-card */}
      <button
        onClick={() => navigate("provider", "verification")}
        className={cn(
          "w-full rounded-2xl border p-4 text-left shadow-soft transition-all hover:shadow-soft-md tap-highlight-none active:scale-[0.99]",
          profile.verificationStatus === "approved"
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-amber-200 bg-amber-50/40"
        )}
      >
        <div className="flex items-center gap-3">
          {profile.verificationStatus === "approved" ? (
            <div className="rounded-xl bg-emerald-100 p-2 shrink-0"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
          ) : (
            <div className="rounded-xl bg-amber-100 p-2 shrink-0"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold capitalize">{profile.verificationStatus.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground">Provider No. {profile.providerNumber}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            <BadgeCheck className="h-3.5 w-3.5 mr-1" /> View record <ChevronRight className="h-3 w-3 ml-1" />
          </Badge>
        </div>
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{children}</p>;
}
