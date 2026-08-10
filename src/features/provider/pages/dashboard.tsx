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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay, formatTime, fullName } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarDays, Users, FileText, FlaskConical, Share2, Wallet,
  Stethoscope, Clock, AlertTriangle, ArrowRight, CheckCircle2, BadgeCheck,
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
    // Provider payout is roughly 73% of consultation price for GP tier.
    // Real source of truth is the settlements table (shown below).
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

  if (profileLoading || loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <ErrorState message="Provider profile not found." />;

  const firstName = profile.firstName || sessionName.split(" ")[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile.title} ${firstName}`}
        description={`${profile.specialty} · ${profile.city}, ${profile.state}`}
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("provider", "appointments")}>
            <CalendarDays className="h-4 w-4 mr-1" /> View appointments
          </Button>
        }
      />

      {/* Licence expiry notice */}
      {licenceDays !== null && licenceDays < 90 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">
                Medical licence expires {relativeDay(profile.licenceExpiry)}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your MDCN licence ({profile.licenceNumber}) expires on {formatDate(profile.licenceExpiry)}.
                Please initiate revalidation to avoid account suspension.
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("provider", "verification")}>
              View verification
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Waiting Room", icon: Users, page: "appointments", tone: "text-sky-600" },
          { label: "Open Appointments", icon: CalendarDays, page: "appointments", tone: "text-emerald-600" },
          { label: "Review Results", icon: FlaskConical, page: "results", tone: "text-violet-600" },
          { label: "View Referrals", icon: Share2, page: "referrals", tone: "text-amber-600" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => navigate("provider", a.page)}
            className="rounded-lg border bg-background p-4 text-left hover:border-emerald-400 hover:shadow-sm transition-all"
          >
            <a.icon className={`h-5 w-5 mb-2 ${a.tone}`} />
            <p className="text-sm font-medium">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Today's Appts" value={todaysAppointments.length} icon={CalendarDays} tone="info" onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Waiting Patients" value={waitingPatients.length} icon={Users} tone="warning" hint="Checked in / waiting" onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Pending Docs" value={pendingDocumentation.length} icon={FileText} tone="warning" onClick={() => navigate("provider", "appointments")} />
        <MetricCard label="Lab Results to Review" value={labResultsToReview.length} icon={FlaskConical} tone={labResultsToReview.length > 0 ? "danger" : "success"} onClick={() => navigate("provider", "results")} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Open Referrals" value={openReferrals.length} icon={Share2} tone="info" onClick={() => navigate("provider", "referrals")} />
        <MetricCard label="Today's Earnings" value={formatCurrency(todayEarnings)} icon={Wallet} tone="success" hint="~73% of paid consultations" onClick={() => navigate("provider", "earnings")} />
        <MetricCard label="Settled (all-time)" value={formatCurrency(settlementTotal)} icon={Wallet} tone="success" hint={`${settlements.length} settlement(s)`} onClick={() => navigate("provider", "earnings")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's schedule */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4" /> Today&apos;s schedule
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("provider", "appointments")}>
                View all
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaysAppointments.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No appointments today"
                  description="Your schedule is clear. Use this time for documentation or follow-ups."
                />
              ) : (
                todaysAppointments.slice(0, 6).map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {formatTime(a.time)} · {a.patient ? fullName(a.patient) : "Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {intakeReason(a)} · {a.consultationChannel.replace("_", " ")}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {(a.status === "scheduled" || a.status === "checked_in" || a.status === "waiting_for_provider") && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={startingId === a.id}
                          onClick={() => startConsultation(a)}
                        >
                          {startingId === a.id ? "Starting…" : "Start consultation"}
                        </Button>
                      )}
                      {a.status === "in_progress" && a.encounter && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("provider", "encounter", { id: a.encounter!.id })}>
                          Continue documentation
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => navigate("provider", "appointment", { id: a.id })}>
                        Details
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pending documentation */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Pending documentation
              </CardTitle>
              <span className="text-xs text-muted-foreground">{pendingDocumentation.length} open</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingDocumentation.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">All encounters are documented. 🎉</p>
              ) : (
                pendingDocumentation.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {e.patient ? fullName(e.patient) : "Patient"} · {e.encounterNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
            </CardContent>
          </Card>

          {/* Lab results to review */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <FlaskConical className="h-4 w-4" /> Lab results awaiting review
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("provider", "results")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {labResultsToReview.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No results pending your review.</p>
              ) : (
                labResultsToReview.slice(0, 3).map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {l.result?.test ?? l.tests.join(", ")} · {l.patient ? fullName(l.patient) : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Value {l.result?.value} {l.result?.unit} · {l.result?.abnormalIndicator ?? "normal"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("provider", "results", { id: l.result?.id ?? "" })}>
                      Review
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Waiting room */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Waiting room
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {waitingPatients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No patients waiting.</p>
              ) : (
                waitingPatients.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.patient ? fullName(a.patient) : "Patient"}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(a.time)} · {intakeReason(a)}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <Button size="sm" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700" disabled={startingId === a.id} onClick={() => startConsultation(a)}>
                      {startingId === a.id ? "Starting…" : "Start consultation"}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Open referrals received */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Share2 className="h-4 w-4" /> Incoming referrals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {openReferrals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No incoming referrals.</p>
              ) : (
                openReferrals.slice(0, 3).map((r) => (
                  <div key={r.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium truncate">{r.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      From {r.sender ? `${r.sender.title} ${r.sender.lastName}` : "Provider"} · {r.patient ? fullName(r.patient) : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status={r.status} />
                      <Button size="sm" variant="outline" onClick={() => navigate("provider", "referrals")}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Follow-ups */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Upcoming follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No upcoming follow-ups.</p>
              ) : (
                followUps.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.patient ? fullName(a.patient) : "Patient"}</p>
                      <p className="text-xs text-muted-foreground">{relativeDay(a.date)} · {formatTime(a.time)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointment", { id: a.id })}>
                      View
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Verification status mini-card */}
          <Card className={profile.verificationStatus === "approved" ? "border-emerald-200 bg-emerald-50/40" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {profile.verificationStatus === "approved" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">Verification: {profile.verificationStatus.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">Provider No. {profile.providerNumber}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => navigate("provider", "verification")}>
                <BadgeCheck className="h-4 w-4 mr-1" /> View verification record
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
