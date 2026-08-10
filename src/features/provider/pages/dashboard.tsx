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
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  SkeletonGrid,
  ErrorState,
} from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay, formatTime, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarDays, Users, FileText, FlaskConical, Share2, Wallet,
  Stethoscope, Clock, AlertTriangle, ArrowRight, CheckCircle2, BadgeCheck,
  Video, Phone, MessageSquare, User,
} from "lucide-react";

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

function channelIcon(channel: string) {
  if (channel === "video") return Video;
  if (channel === "audio") return Phone;
  if (channel === "chat") return MessageSquare;
  return User;
}

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

  const weekEarnings = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recent = appointments.filter(
      (a) => a.date >= weekAgo && a.status === "completed" && a.paymentStatus === "paid"
    );
    return recent.reduce((sum, a) => sum + Math.round(a.price * 0.73), 0);
  }, [appointments]);

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
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <ErrorState message="Provider profile not found." />;

  const firstName = profile.firstName || sessionName.split(" ")[0];

  const quickActions = [
    { label: "Waiting Room", icon: Users, page: "appointments", tone: "text-sky-600" as const },
    { label: "Open Appointments", icon: CalendarDays, page: "appointments", tone: "text-emerald-600" as const },
    { label: "Review Results", icon: FlaskConical, page: "results", tone: "text-violet-600" as const },
    { label: "View Referrals", icon: Share2, page: "referrals", tone: "text-amber-600" as const },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile.title} ${firstName}`}
        description={`${profile.specialty} · ${profile.city}, ${profile.state}`}
        actions={
          <Button onClick={() => navigate("provider", "appointments")}>
            <CalendarDays className="h-4 w-4 mr-1" /> View appointments
          </Button>
        }
      />

      {/* Licence expiry notice */}
      {licenceDays !== null && licenceDays < 90 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="rounded-xl bg-amber-100 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Medical licence expires {relativeDay(profile.licenceExpiry)}
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Your MDCN licence ({profile.licenceNumber}) expires on {formatDate(profile.licenceExpiry)}.
              Please initiate revalidation to avoid account suspension.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => navigate("provider", "verification")}>
            View verification
          </Button>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate("provider", a.page)}
            className="group rounded-2xl border border-border/80 bg-card p-4 text-left shadow-soft hover:shadow-soft-md hover:border-primary/30 transition-all tap-highlight-none"
          >
            <div className="rounded-xl bg-muted/60 p-2 w-fit group-hover:bg-primary/10 transition-colors">
              <a.icon className={`h-5 w-5 ${a.tone}`} />
            </div>
            <p className="text-sm font-medium mt-2.5">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Today's Appts" value={todaysAppointments.length} icon={CalendarDays} tone="info" onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Waiting Patients" value={waitingPatients.length} icon={Users} tone="warning" hint="Checked in / waiting" onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Pending Docs" value={pendingDocumentation.length} icon={FileText} tone={pendingDocumentation.length > 0 ? "warning" : "success"} onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Lab Results to Review" value={labResultsToReview.length} icon={FlaskConical} tone={labResultsToReview.length > 0 ? "danger" : "success"} onClick={() => navigate("provider", "results")} />
      </div>

      {/* MiniMetrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MiniMetric label="Open Referrals" value={openReferrals.length} tone="info" />
        <MiniMetric label="Today's Earnings" value={formatCurrency(todayEarnings)} tone="success" />
        <MiniMetric label="Week Earnings" value={formatCurrency(weekEarnings)} tone="success" />
        <MiniMetric label="Settled Total" value={formatCurrency(settlementTotal)} tone="violet" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard
            title="Today's schedule"
            icon={Stethoscope}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("provider", "appointments")}>
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            }
          >
            <div className="space-y-2.5">
              {todaysAppointments.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No appointments today"
                  description="Your schedule is clear. Use this time for documentation or follow-ups."
                  compact
                />
              ) : (
                todaysAppointments.slice(0, 6).map((a) => {
                  const Icon = channelIcon(a.consultationChannel);
                  return (
                    <div key={a.id} className="rounded-xl border border-border/80 bg-card p-3.5 hover:shadow-soft transition-shadow">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                            {a.patient ? initials(fullName(a.patient)) : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {formatTime(a.time)} · {a.patient ? fullName(a.patient) : "Patient"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{intakeReason(a)} · {a.consultationChannel.replace(/_/g, " ")}</span>
                              </p>
                            </div>
                            <StatusBadge status={a.status} size="sm" />
                          </div>
                          <div className="mt-2.5 flex gap-2 flex-wrap">
                            {(a.status === "scheduled" || a.status === "checked_in" || a.status === "waiting_for_provider") && (
                              <Button
                                size="sm"
                                disabled={startingId === a.id}
                                onClick={() => startConsultation(a)}
                              >
                                {startingId === a.id ? "Starting…" : "Start consultation"}
                              </Button>
                            )}
                            {a.status === "in_progress" && a.encounter && (
                              <Button size="sm" onClick={() => navigate("provider", "encounter", { id: a.encounter!.id })}>
                                Continue documentation
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => navigate("provider", "appointment", { id: a.id })}>
                              Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          {/* Pending documentation */}
          <SectionCard
            title="Pending documentation"
            icon={FileText}
            description="Open encounters that need your SOAP notes"
            action={
              <Badge variant={pendingDocumentation.length > 0 ? "secondary" : "outline"} className="h-6">
                {pendingDocumentation.length} open
              </Badge>
            }
          >
            <div className="space-y-2.5">
              {pendingDocumentation.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">All encounters are documented.</p>
                  <p className="text-xs text-muted-foreground mt-1">Nothing pending. Great work!</p>
                </div>
              ) : (
                pendingDocumentation.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {e.patient ? fullName(e.patient) : "Patient"} · {e.encounterNumber}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Started {formatDate(e.createdAt)}
                        {e.appointment ? ` · ${formatTime(e.appointment.time)} ${relativeDay(e.appointment.date)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate("provider", "encounter", { id: e.id })}>
                      Resume <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          {/* Lab results to review */}
          <SectionCard
            title="Lab results awaiting review"
            icon={FlaskConical}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("provider", "results")}>View all</Button>
            }
          >
            <div className="space-y-2.5">
              {labResultsToReview.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">No results pending your review.</p>
                </div>
              ) : (
                labResultsToReview.slice(0, 3).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {l.result?.test ?? l.tests.join(", ")} · {l.patient ? fullName(l.patient) : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Value <span className="font-medium text-foreground">{l.result?.value} {l.result?.unit}</span> · {l.result?.abnormalIndicator ?? "normal"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("provider", "results", { id: l.result?.id ?? "" })}>
                      Review
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Waiting room */}
          <SectionCard
            title="Waiting room"
            icon={Users}
            action={waitingPatients.length > 0 ? <Badge variant="secondary" className="h-6 bg-amber-100 text-amber-700 border-amber-200">{waitingPatients.length}</Badge> : undefined}
          >
            <div className="space-y-2.5">
              {waitingPatients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No patients waiting.</p>
              ) : (
                waitingPatients.map((a) => (
                  <div key={a.id} className="rounded-xl border border-border/80 bg-card p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{a.patient ? fullName(a.patient) : "Patient"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{formatTime(a.time)} · {intakeReason(a)}</p>
                      </div>
                      <StatusBadge status={a.status} size="sm" />
                    </div>
                    <Button size="sm" className="w-full mt-2.5" disabled={startingId === a.id} onClick={() => startConsultation(a)}>
                      {startingId === a.id ? "Starting…" : "Start consultation"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          {/* Open referrals received */}
          <SectionCard
            title="Incoming referrals"
            icon={Share2}
            action={openReferrals.length > 0 ? <Badge variant="secondary" className="h-6 bg-amber-100 text-amber-700 border-amber-200">{openReferrals.length}</Badge> : undefined}
          >
            <div className="space-y-2.5">
              {openReferrals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No incoming referrals.</p>
              ) : (
                openReferrals.slice(0, 3).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/80 bg-card p-3.5">
                    <p className="text-sm font-semibold truncate">{r.reason}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      From {r.sender ? `${r.sender.title} ${r.sender.lastName}` : "Provider"} · {r.patient ? fullName(r.patient) : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <StatusBadge status={r.status} size="sm" />
                      <Button size="sm" variant="outline" onClick={() => navigate("provider", "referrals")}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          {/* Follow-ups */}
          <SectionCard title="Upcoming follow-ups" icon={Clock}>
            <div className="space-y-2.5">
              {followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No upcoming follow-ups.</p>
              ) : (
                followUps.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-card p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{a.patient ? fullName(a.patient) : "Patient"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{relativeDay(a.date)} · {formatTime(a.time)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointment", { id: a.id })}>
                      View
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          {/* Verification status mini-card */}
          <div className={`rounded-2xl border p-4 shadow-soft ${profile.verificationStatus === "approved" ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
            <div className="flex items-center gap-2.5">
              {profile.verificationStatus === "approved" ? (
                <div className="rounded-xl bg-emerald-100 p-2 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              ) : (
                <div className="rounded-xl bg-amber-100 p-2 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize">{profile.verificationStatus.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">Provider No. {profile.providerNumber}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => navigate("provider", "verification")}>
              <BadgeCheck className="h-4 w-4 mr-1" /> View verification record
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
