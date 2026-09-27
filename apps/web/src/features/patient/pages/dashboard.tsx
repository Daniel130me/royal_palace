"use client";

import { useEffect, useState, useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePatientContext } from "../use-patient-context";
import { appointmentService, prescriptionService, labRequestService, pharmacyOrderService } from "@/lib/services";
import type { Appointment, Prescription, LaboratoryRequest, PharmacyOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SkeletonGrid } from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatCurrency, relativeDay, formatTime, age } from "@/lib/format";
import {
  Pill, FlaskConical, Package, Stethoscope, Video, Phone, MessageSquare,
  ChevronRight, FileText, ArrowRight, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { consultationActionLabel, isOnlineConsultationChannel } from "@/lib/consultation-policy";
import type { OnlineConsultationChannel } from "@/lib/consultation-policy";

const QUICK_ACTIONS = [
  { label: "Consult", sub: "Find a doctor", icon: Stethoscope, page: "doctors", tone: "success" as const },
  { label: "Lab test", sub: "Book diagnostics", icon: FlaskConical, page: "laboratory", tone: "violet" as const },
  { label: "Pharmacy", sub: "Order medicines", icon: Pill, page: "prescriptions", tone: "warning" as const },
  { label: "Records", sub: "View timeline", icon: FileText, page: "records", tone: "info" as const },
];

const TONE_BG: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

export function PatientDashboard() {
  const { sessionName, activePatientId } = useNav();
  const { profile, primary, dependants, loading, unread, notifications, selectPatient } = usePatientContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    Promise.all([
      appointmentService.list({ patientId: profile.id }),
      prescriptionService.list({ patientId: profile.id }),
      labRequestService.list({ patientId: profile.id }),
      pharmacyOrderService.list({ patientId: profile.id }),
    ]).then(([a, rx, lab, ord]) => {
      if (cancelled) return;
      setAppointments(a);
      setPrescriptions(rx);
      setLabRequests(lab);
      setOrders(ord);
      setReady(true);
    });
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
  const recentNotifications = notifications.slice(0, 3);

  const firstName = profile?.firstName ?? sessionName.split(" ")[0];

  if (loading || !profile) return <SkeletonGrid count={4} />;

  return (
    <div className="space-y-5">
      {/* Greeting + dependant switcher */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">{firstName} 👋</h1>
        </div>
        {(dependants.length > 0 || primary) && (
          <DependantSwitcher
            profile={profile!}
            primary={primary}
            dependants={dependants}
            activeId={activePatientId ?? profile!.id}
            onSelect={selectPatient}
          />
        )}
      </div>

      {/* Hero: next appointment (or empty CTA) */}
      {upcoming[0] ? (
        <NextAppointmentCard appointment={upcoming[0]} />
      ) : (
        <button
          onClick={() => navigate("patient", "doctors")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">No upcoming appointment</p>
              <p className="text-xl font-bold mt-1">Book a consultation</p>
              <p className="text-xs text-emerald-100/80 mt-1">Video, voice or chat</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* Quick actions grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={() => navigate("patient", a.page as any)}
              className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-border hover:shadow-soft tap-highlight-none active:scale-[0.97] sm:min-h-0"
            >
              <div className={cn("rounded-xl p-2 ring-1", TONE_BG[a.tone])}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium leading-tight text-center">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stats row — tappable */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Visits" value={appointments.length} onClick={() => navigate("patient", "appointments")} />
        <StatTile label="Rx" value={prescriptions.length} tone="info" onClick={() => navigate("patient", "prescriptions")} />
        <StatTile label="Labs" value={labRequests.length} tone="violet" onClick={() => navigate("patient", "laboratory")} />
        <StatTile label="Orders" value={orders.length} tone="warning" onClick={() => navigate("patient", "orders")} />
      </div>

      {/* Pending tasks (only if any) */}
      {(pendingRx.length > 0 || pendingLab.length > 0 || activeOrders.length > 0) && (
        <div className="space-y-2">
          <SectionLabel>Action needed</SectionLabel>
          <div className="space-y-1.5">
            {pendingLab.slice(0, 1).map((lab) => (
              <ActionRow
                key={lab.id}
                icon={<div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100"><FlaskConical className="h-4 w-4 text-violet-600" /></div>}
                title="Lab test pending"
                subtitle={lab.tests.join(", ")}
                badge={<StatusBadge status={lab.status} size="sm" />}
                onClick={() => navigate("patient", "laboratory")}
              />
            ))}
            {pendingRx.slice(0, 1).map((rx) => (
              <ActionRow
                key={rx.id}
                icon={<div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"><Pill className="h-4 w-4 text-amber-600" /></div>}
                title="Order your medicines"
                subtitle={`${rx.items?.length ?? 0} item(s) ready to order`}
                badge={<StatusBadge status={rx.status} size="sm" />}
                onClick={() => navigate("patient", "prescription", { id: rx.id })}
              />
            ))}
            {activeOrders.slice(0, 1).map((ord) => (
              <ActionRow
                key={ord.id}
                icon={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><Package className="h-4 w-4 text-sky-600" /></div>}
                title="Order in progress"
                subtitle={ord.orderNumber}
                badge={<StatusBadge status={ord.status} size="sm" />}
                onClick={() => navigate("patient", "order", { id: ord.id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent activity (notifications) */}
      {recentNotifications.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent updates</SectionLabel>
            {unread > 0 && (
              <button onClick={() => navigate("patient", "notifications")} className="flex items-center gap-1 text-xs font-medium text-primary">
                <Bell className="h-3.5 w-3.5" /> {unread} new
              </button>
            )}
          </div>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {recentNotifications.map((n) => (
              <CompactListItem
                key={n.id}
                leading={<div className={cn("rounded-lg p-1.5", n.read ? "bg-muted" : "bg-primary/10")}><Bell className={cn("h-3.5 w-3.5", n.read ? "text-muted-foreground" : "text-primary")} /></div>}
                title={n.title}
                subtitle={n.body}
                onClick={() => navigate("patient", "notifications")}
                chevron
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{children}</p>;
}

function NextAppointmentCard({ appointment }: { appointment: Appointment }) {
  const provider = appointment.provider;
  const channel: OnlineConsultationChannel = isOnlineConsultationChannel(appointment.consultationChannel)
    ? appointment.consultationChannel
    : "video";
  const ChannelIcon = APPOINTMENT_CHANNEL_ICONS[channel];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("patient", "appointment", { id: appointment.id })}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("patient", "appointment", { id: appointment.id }); } }}
      className="w-full rounded-2xl border border-border/60 bg-card p-4 text-left shadow-soft transition-all hover:shadow-soft-md tap-highlight-none active:scale-[0.99] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Next appointment</span>
        <StatusBadge status={appointment.status} size="sm" />
      </div>
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {provider ? `${provider.firstName[0]}${provider.lastName[0]}` : "—"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">
            {provider ? `${provider.title} ${provider.lastName}` : "Consultation"}
          </p>
          <p className="text-xs text-muted-foreground truncate">{provider?.specialty}</p>
          <p className="text-xs text-foreground mt-1 font-medium">
            {relativeDay(appointment.date)} · {formatTime(appointment.time)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("patient", "consultation", { id: appointment.id }); }}>
          <ChannelIcon className="h-4 w-4 mr-1" /> {consultationActionLabel(channel)}
        </Button>
        <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("patient", "appointment", { id: appointment.id }); }}>
          Details
        </Button>
      </div>
    </div>
  );
}

const APPOINTMENT_CHANNEL_ICONS: Record<OnlineConsultationChannel, React.ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Phone,
  chat: MessageSquare,
};

function ActionRow({ icon, title, subtitle, badge, onClick }: { icon: React.ReactNode; title: string; subtitle: string; badge?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-all hover:border-border hover:shadow-soft tap-highlight-none active:scale-[0.99]"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {badge}
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
    </button>
  );
}

function DependantSwitcher({ profile, primary, dependants, activeId, onSelect }: {
  profile: { id: string; firstName: string; lastName: string; dateOfBirth: string; gender: string };
  primary: { id: string; firstName: string; lastName: string; dateOfBirth: string; gender: string } | null;
  dependants: { id: string; firstName: string; lastName: string; dateOfBirth: string; gender: string; parentPatientId?: string | null }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const all = [primary ?? profile, ...dependants];
  const active = all.find((p) => p.id === activeId) ?? profile;
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border/60 bg-card py-1 pl-1 pr-3 tap-highlight-none active:scale-[0.98]"
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {active.firstName[0]}{active.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium max-w-[80px] truncate">{active.firstName}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-border/60 bg-card shadow-soft-lg p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch profile</p>
            {all.map((p) => {
              const isActive = p.id === activeId;
              const isDependant = "parentPatientId" in p && p.parentPatientId;
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left tap-highlight-none",
                    isActive ? "bg-primary/10" : "hover:bg-accent"
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={cn("text-[10px] font-semibold", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      {p.firstName[0]}{p.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate leading-tight">{p.firstName} {p.lastName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{isDependant ? "Dependant" : "You"} · {age(p.dateOfBirth)}y</p>
                  </div>
                  {isActive && <div className="h-2 w-2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
