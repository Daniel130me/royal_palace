"use client";

import { useEffect, useState, useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePatientContext } from "../use-patient-context";
import { appointmentService, prescriptionService, labRequestService, pharmacyOrderService, carePlanService } from "@/lib/services";
import type { Appointment, Prescription, LaboratoryRequest, PharmacyOrder, CarePlan } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PageHeader, SectionCard, EmptyState, LoadingState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatCurrency, formatDate, relativeDay, formatTime, age, initials } from "@/lib/format";
import {
  CalendarDays, Pill, FlaskConical, Package, Stethoscope, Plus, Video,
  HeartPulse, Activity, AlertCircle, ArrowRight, Bell, FileText,
  ShieldCheck, Building2, User, ChevronRight,
} from "lucide-react";

const QUICK_ACTIONS = [
  { label: "Consult", sub: "Find a doctor", icon: Stethoscope, page: "doctors", tone: "success" },
  { label: "Lab test", sub: "Book diagnostics", icon: FlaskConical, page: "laboratory", tone: "violet" },
  { label: "Pharmacy", sub: "Order medicines", icon: Pill, page: "prescriptions", tone: "warning" },
  { label: "Records", sub: "View timeline", icon: FileText, page: "records", tone: "info" },
] as const;

const TONE_BG: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

export function PatientDashboard() {
  const { sessionName } = useNav();
  const { profile, loading, unread, notifications } = usePatientContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    Promise.all([
      appointmentService.list({ patientId: profile.id }),
      prescriptionService.list({ patientId: profile.id }),
      labRequestService.list({ patientId: profile.id }),
      pharmacyOrderService.list({ patientId: profile.id }),
      carePlanService.list(profile.id),
    ]).then(([a, rx, lab, ord, plans]) => {
      if (cancelled) return;
      setAppointments(a);
      setPrescriptions(rx);
      setLabRequests(lab);
      setOrders(ord);
      setCarePlans(plans);
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const upcoming = useMemo(
    () => appointments
      .filter((a) => ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [appointments]
  );
  const pendingRx = prescriptions.filter((p) => ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(p.status));
  const pendingLab = labRequests.filter((l) => l.status === "pending_booking");
  const activeOrders = orders.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status));

  if (loading || !profile) {
    return (
      <div className="space-y-6">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <SkeletonGrid count={4} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  const firstName = profile.firstName ?? sessionName.split(" ")[0];
  const nextAppt = upcoming[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`Managing healthcare for ${profile.firstName} ${profile.lastName}`}
        actions={
          <Button size="sm" onClick={() => navigate("patient", "doctors")} className="sm:hidden">
            <Stethoscope className="h-4 w-4" /> Consult
          </Button>
        }
      />

      {/* Quick actions grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          const tone = TONE_BG[a.tone];
          return (
            <button
              key={a.label}
              onClick={() => navigate("patient", a.page as any)}
              className="group rounded-2xl border border-border/80 bg-card p-4 text-left shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30 tap-highlight-none"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-2.5 text-sm font-semibold leading-tight">{a.label}</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">{a.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Metrics — 2x2 mobile grid using MiniMetric */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniMetric label="Upcoming" value={upcoming.length} tone="info" />
        <MiniMetric label="Active Rx" value={pendingRx.length} tone="success" />
        <MiniMetric label="Pending tests" value={pendingLab.length} tone="warning" />
        <MiniMetric label="Active orders" value={activeOrders.length} tone="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: upcoming + prescriptions + health summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming appointment — prominent */}
          <SectionCard
            title="Upcoming appointment"
            icon={CalendarDays}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("patient", "appointments")}>
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            {nextAppt ? (
              <div>
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-50/30 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {nextAppt.provider ? initials(`${nextAppt.provider.firstName} ${nextAppt.provider.lastName}`) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight truncate">
                            {nextAppt.provider ? `${nextAppt.provider.title} ${nextAppt.provider.lastName}` : "Consultation"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{nextAppt.provider?.specialty}</p>
                        </div>
                        <StatusBadge status={nextAppt.status} size="sm" />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <CalendarDays className="h-3 w-3 text-primary" />
                          {relativeDay(nextAppt.date)} · {formatTime(nextAppt.time)}
                        </span>
                        <span className="text-muted-foreground capitalize">· {nextAppt.consultationChannel.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {nextAppt.consultationChannel === "video" && (
                      <Button size="sm" onClick={() => navigate("patient", "consultation", { id: nextAppt.id })}>
                        <Video className="h-3.5 w-3.5" /> Join consultation
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate("patient", "appointment", { id: nextAppt.id })}>
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming appointment"
                description="Book a consultation with one of our verified doctors."
                compact
                action={<Button size="sm" onClick={() => navigate("patient", "doctors")}>Find a doctor</Button>}
              />
            )}
          </SectionCard>

          {/* Active prescriptions */}
          <SectionCard
            title="Active prescriptions"
            icon={Pill}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("patient", "prescriptions")}>
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            }
            dense
          >
            {pendingRx.length === 0 ? (
              <div className="p-5">
                <p className="text-sm text-muted-foreground text-center py-4">No active prescriptions.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {pendingRx.slice(0, 3).map((rx) => (
                  <li key={rx.id}>
                    <button
                      onClick={() => navigate("patient", "prescription", { id: rx.id })}
                      className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-accent/40 transition-colors text-left tap-highlight-none"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 ring-1 ring-violet-100 shrink-0">
                        <Pill className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{rx.prescriptionNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {rx.items?.length ?? 0} item(s) · expires {formatDate(rx.expiryDate)}
                        </p>
                      </div>
                      <StatusBadge status={rx.status} size="sm" />
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Health summary */}
          <SectionCard title="Health summary" icon={HeartPulse}>
            <div className="grid gap-4 sm:grid-cols-3">
              <HealthColumn
                label="Active conditions"
                tone="warning"
                icon={Activity}
                items={profile.conditions.map((c) => ({ name: c.name, source: c.source }))}
                emptyText="None recorded"
              />
              <HealthColumn
                label="Allergies"
                tone="danger"
                icon={AlertCircle}
                items={profile.allergies.map((c) => ({ name: c.name, source: c.source }))}
                emptyText="None recorded"
              />
              <HealthColumn
                label="Current medicines"
                tone="info"
                icon={Pill}
                items={profile.medications.map((c) => ({ name: c.name, source: c.source }))}
                emptyText="None"
              />
            </div>
            {carePlans[0] && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5" /> Active care plan
                </p>
                <p className="text-sm font-medium mt-1">{carePlans[0].title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{carePlans[0].description}</p>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: notifications + pending lab + profile */}
        <div className="space-y-6">
          <SectionCard
            title="Notifications"
            icon={Bell}
            action={unread > 0 ? (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 h-5 px-1.5 text-[10px] font-semibold">
                {unread} new
              </Badge>
            ) : undefined}
          >
            <div className="space-y-2 max-h-80 overflow-y-auto -mx-1 px-1">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No notifications.</p>
              ) : notifications.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate("patient", "notifications")}
                  className={`w-full rounded-xl p-3 text-left transition-colors hover:bg-accent/40 tap-highlight-none ${
                    n.read ? "bg-muted/40" : "bg-primary/5 ring-1 ring-primary/10"
                  }`}
                >
                  <p className="font-medium text-xs leading-tight">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{n.body}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          {pendingLab[0] && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> Pending laboratory test
              </p>
              <p className="text-sm mt-1 font-medium">{pendingLab[0].tests.join(", ")}</p>
              <Button size="sm" variant="outline" className="mt-3 w-full bg-card" onClick={() => navigate("patient", "laboratory")}>
                Book test <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}

          <SectionCard title="Profile" icon={User}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Patient No.</dt>
                <dd className="font-medium font-mono text-xs">{profile.patientNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Age</dt>
                <dd className="font-medium">{age(profile.dateOfBirth)} years</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Blood group</dt>
                <dd className="font-medium">{profile.bloodGroup ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Genotype</dt>
                <dd className="font-medium">{profile.genotype ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium text-right">{profile.city}, {profile.state}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function HealthColumn({
  label, tone, icon: Icon, items, emptyText,
}: {
  label: string;
  tone: "warning" | "danger" | "info";
  icon: React.ComponentType<{ className?: string }>;
  items: { name: string; source?: string }[];
  emptyText: string;
}) {
  const dotColor = tone === "warning" ? "bg-amber-500" : tone === "danger" ? "bg-rose-500" : "bg-sky-500";
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} />
                <span className="truncate">{c.name}</span>
              </span>
              <ProvenanceBadge source={c.source} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProvenanceBadge({ source }: { source?: string }) {
  if (source === "provider-confirmed") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] gap-0.5 h-4 px-1">
        <ShieldCheck className="h-2.5 w-2.5" /> Confirmed
      </Badge>
    );
  }
  if (source === "imported") {
    return (
      <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1">
        <Building2 className="h-2.5 w-2.5" /> Imported
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1">
      <User className="h-2.5 w-2.5" /> Self
    </Badge>
  );
}
