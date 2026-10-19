"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import {
  encounterService,
  productionClinicalService,
  productionLaboratoryService,
  schedulingPaymentService,
  type ProviderClinicalReferral,
} from "@/lib/services";
import { normalizeEncounter } from "../normalize";
import type { ClinicalEncounter } from "@/types";
import type {
  LaboratoryResultResponse,
  ProviderAppointmentResponse,
} from "@royal-palace/contracts";
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
import { formatDate, relativeDay, formatTime, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarDays,
  Users,
  FileText,
  FlaskConical,
  Share2,
  Stethoscope,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  BadgeCheck,
  Video,
  Phone,
  MessageSquare,
  User,
  ChevronRight,
  PlayCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function dashboardAppointmentRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 31);
  return { dayFrom: start.toISOString(), dayTo: end.toISOString() };
}

function isSameLocalDay(value: string, reference: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export function intakeReason(appointment: ProviderAppointmentResponse): string {
  return appointment.intake?.reason ?? appointment.intake?.symptoms ?? "Reason not provided";
}

export function channelIcon(channel: string) {
  if (channel === "VIDEO") return Video;
  if (channel === "AUDIO") return Phone;
  if (channel === "CHAT") return MessageSquare;
  return User;
}

const QUICK_ACTIONS = [
  {
    label: "Appointments",
    icon: CalendarDays,
    page: "appointments",
    tone: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  {
    label: "Patients",
    icon: Users,
    page: "patients",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  {
    label: "Lab results",
    icon: FlaskConical,
    page: "results",
    tone: "bg-violet-50 text-violet-700 ring-violet-100",
  },
  {
    label: "Referrals",
    icon: Share2,
    page: "referrals",
    tone: "bg-amber-50 text-amber-700 ring-amber-100",
  },
];

export function ProviderDashboard() {
  const { sessionName } = useNav();
  const { profile, providerId, loading: profileLoading } = useProviderContext();
  const [appointments, setAppointments] = useState<ProviderAppointmentResponse[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [labResults, setLabResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [referrals, setReferrals] = useState<ProviderClinicalReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const range = dashboardAppointmentRange();
      const [appointmentPage, encs, resultPage, referralPage] = await Promise.all([
        schedulingPaymentService.providerAppointments({
          dayFrom: range.dayFrom,
          dayTo: range.dayTo,
          limit: 50,
          scope: "ALL",
        }),
        encounterService.listProvider(),
        productionLaboratoryService.provider.results(undefined, 50),
        productionClinicalService.provider.listReferrals("RECEIVED", undefined, 50),
      ]);
      setAppointments([...appointmentPage.data]);
      setEncounters(encs.map(normalizeEncounter));
      setLabResults(resultPage.data);
      setReferrals([...referralPage.data]);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();

  const todaysAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => isSameLocalDay(appointment.startsAt, now))
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    [appointments, now],
  );

  const readyAppointments = useMemo(() => {
    const currentTime = now.getTime();
    return appointments.filter(
      (appointment) =>
        appointment.status === "CONFIRMED" &&
        Date.parse(appointment.startsAt) <= currentTime &&
        Date.parse(appointment.endsAt) >= currentTime,
    );
  }, [appointments, now]);

  const pendingDocumentation = useMemo(
    () => encounters.filter((e) => e.status === "open"),
    [encounters],
  );

  const labResultsToReview = useMemo(
    () =>
      labResults.filter((result) =>
        result.criticalResults.some(
          (critical) => critical.status === "OPEN" || critical.status === "ESCALATED",
        ),
      ),
    [labResults],
  );

  const openReferrals = useMemo(
    () => referrals.filter((referral) => referral.status === "ACTIVE"),
    [referrals],
  );

  const followUps = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            appointment.status === "CONFIRMED" && Date.parse(appointment.startsAt) > now.getTime(),
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
        .slice(0, 3),
    [appointments, now],
  );

  const licenceDays = profile ? daysUntil(profile.licenceExpiry) : null;

  async function startConsultation(appointmentId: string) {
    if (!providerId) return;
    setStartingId(appointmentId);
    try {
      const enc = await encounterService.start(appointmentId, providerId);
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
    ...readyAppointments.slice(0, 2).map((appointment) => ({
      id: appointment.id,
      icon: (
        <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100">
          <Users className="h-4 w-4 text-amber-600" />
        </div>
      ),
      title: `${appointment.patient.displayName} is ready`,
      subtitle: `${formatTime(appointment.startsAt)} · ${intakeReason(appointment)}`,
      badge: <StatusBadge status={appointment.status.toLowerCase()} size="sm" />,
      onClick: () => startConsultation(appointment.id),
    })),
    ...pendingDocumentation.slice(0, 2).map((e) => ({
      id: e.id,
      icon: (
        <div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100">
          <FileText className="h-4 w-4 text-violet-600" />
        </div>
      ),
      title: `${e.patient ? fullName(e.patient) : "Patient"} · ${e.encounterNumber}`,
      subtitle: `Open encounter · started ${formatDate(e.createdAt)}`,
      badge: (
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]"
        >
          open
        </Badge>
      ),
      onClick: () => navigate("provider", "encounter", { id: e.id }),
    })),
    ...labResultsToReview.slice(0, 2).map((result) => ({
      id: result.id,
      icon: (
        <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100">
          <FlaskConical className="h-4 w-4 text-rose-600" />
        </div>
      ),
      title: result.service.name,
      subtitle: `${result.patient.displayName} · ${result.resultNumber}`,
      badge: (
        <Badge
          variant="outline"
          className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]"
        >
          action required
        </Badge>
      ),
      onClick: () => navigate("provider", "results", { id: result.id }),
    })),
  ].slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Greeting + verification status */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">
            {profile.title ? `${profile.title} ` : ""}
            {firstName} 👋
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.specialty}</p>
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
            <span className="text-xs font-medium text-amber-700 capitalize">
              {profile.verificationStatus.replace(/_/g, " ")}
            </span>
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
              Credential {profile.licenceNumber} · initiate revalidation to avoid suspension.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />
        </button>
      )}

      {/* Hero: next appointment today with Start CTA (or empty CTA) */}
      {heroAppt ? (
        (() => {
          const ChannelIcon = channelIcon(heroAppt.mode);
          const activeEncounter = encounters.find(
            (encounter) => encounter.appointmentId === heroAppt.id && encounter.status === "open",
          );
          return (
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Next consultation · {relativeDay(heroAppt.startsAt)}
                </span>
                <StatusBadge status={heroAppt.status.toLowerCase()} size="sm" />
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {initials(heroAppt.patient.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {formatTime(heroAppt.startsAt)} · {heroAppt.patient.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                    <ChannelIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {intakeReason(heroAppt)} · {heroAppt.mode.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {heroAppt.status === "CONFIRMED" && activeEncounter === undefined && (
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={startingId === heroAppt.id}
                    onClick={() => startConsultation(heroAppt.id)}
                  >
                    <PlayCircle className="h-4 w-4 mr-1" />{" "}
                    {startingId === heroAppt.id ? "Starting…" : "Start consultation"}
                  </Button>
                )}
                {activeEncounter !== undefined && (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate("provider", "encounter", { id: activeEncounter.id })}
                  >
                    <Stethoscope className="h-4 w-4 mr-1" /> Continue documentation
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("provider", "appointment", { id: heroAppt.id })}
                >
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
              <p className="text-xs text-emerald-100/80 mt-1">
                Check upcoming appointments & follow-ups
              </p>
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
        <StatTile
          label="Today"
          value={todaysAppointments.length}
          icon={CalendarDays}
          tone="info"
          onClick={() => navigate("provider", "appointments")}
        />
        <StatTile
          label="Pending docs"
          value={pendingDocumentation.length}
          icon={FileText}
          tone={pendingDocumentation.length > 0 ? "warning" : "success"}
          onClick={() => navigate("provider", "appointments")}
        />
        <StatTile
          label="Lab review"
          value={labResultsToReview.length}
          icon={FlaskConical}
          tone={labResultsToReview.length > 0 ? "danger" : "success"}
          onClick={() => navigate("provider", "results")}
        />
        <StatTile
          label="Referrals"
          value={openReferrals.length}
          icon={Share2}
          tone="info"
          onClick={() => navigate("provider", "referrals")}
        />
      </div>

      {/* Commercial amounts remain hidden until the provider policy is approved and configured. */}
      <div className="grid grid-cols-3 gap-2.5">
        <MiniMetric label="Today's earnings" value="Not configured" tone="default" />
        <MiniMetric label="Settlements" value="Not configured" tone="default" />
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
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("provider", "appointments")}>
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          }
        >
          {followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming follow-ups.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {followUps.map((a) => (
                <CompactListItem
                  key={a.id}
                  leading={
                    <div className="rounded-lg bg-primary/10 p-1.5">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                  }
                  title={a.patient.displayName}
                  subtitle={`${relativeDay(a.startsAt)} · ${formatTime(a.startsAt)}`}
                  trailing={<StatusBadge status={a.status.toLowerCase()} size="sm" />}
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
          action={
            openReferrals.length > 0 ? (
              <Badge
                variant="secondary"
                className="h-6 bg-amber-100 text-amber-700 border-amber-200"
              >
                {openReferrals.length}
              </Badge>
            ) : undefined
          }
        >
          {openReferrals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No incoming referrals.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {openReferrals.slice(0, 3).map((r) => (
                <CompactListItem
                  key={r.id}
                  leading={
                    <div className="rounded-lg bg-amber-50 p-1.5">
                      <Share2 className="h-4 w-4 text-amber-600" />
                    </div>
                  }
                  title={r.reason}
                  subtitle={`From ${r.sender.displayName} · ${r.patient.displayName}`}
                  trailing={<StatusBadge status={r.status.toLowerCase()} size="sm" />}
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
            : "border-amber-200 bg-amber-50/40",
        )}
      >
        <div className="flex items-center gap-3">
          {profile.verificationStatus === "approved" ? (
            <div className="rounded-xl bg-emerald-100 p-2 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          ) : (
            <div className="rounded-xl bg-amber-100 p-2 shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold capitalize">
              {profile.verificationStatus.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted-foreground">Provider No. {profile.providerNumber}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            <BadgeCheck className="h-3.5 w-3.5 mr-1" /> View record{" "}
            <ChevronRight className="h-3 w-3 ml-1" />
          </Badge>
        </div>
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
      {children}
    </p>
  );
}
