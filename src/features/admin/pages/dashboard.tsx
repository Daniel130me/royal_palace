"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import {
  patientService, providerService, applicationService, appointmentService,
  pharmacyOrderService, deliveryService, settlementService, auditService,
  complaintService, adminService,
} from "@/lib/services";
import { resource } from "@/lib/api-client";
import type {
  Patient, Provider, ProviderApplication, Appointment, PharmacyOrder,
  Delivery, Settlement, AuditLog, Complaint, Payment,
} from "@/types";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, formatDateTime, relativeDay, initials } from "@/lib/format";
import {
  Users, UserCheck, Stethoscope, ClipboardCheck, CalendarDays, FlaskConical,
  Package, Truck, Wallet, TrendingUp, AlertCircle, ShieldAlert, ScrollText,
  BadgeCheck, Clock, ArrowRight, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

function startOfDayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function AdminDashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [labBookings, setLabBookings] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      patientService.list(),
      providerService.list(),
      applicationService.list(),
      appointmentService.list(),
      pharmacyOrderService.list(),
      deliveryService.list(),
      resource.list<Payment>("payment"),
      settlementService.list(),
      auditService.list(),
      complaintService.list(),
      resource.list<unknown>("laboratoryBooking"),
    ])
      .then(([p, pr, ap, apt, ord, del, pay, stl, aud, cmp, lab]) => {
        setPatients(p);
        setProviders(pr);
        setApplications(ap);
        setAppointments(apt);
        setOrders(ord);
        setDeliveries(del);
        setPayments(pay);
        setSettlements(stl);
        setAudit(aud);
        setComplaints(cmp);
        setLabBookings(lab);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  };

  const refetch = () => {
    setLoading(true);
    setError(null);
    load();
  };

  useEffect(() => { load(); }, []);

  const todayStr = startOfDayStr();
  const primaryPatients = useMemo(() => patients.filter((p) => !p.parentPatientId), [patients]);
  const verifiedProviders = useMemo(() => providers.filter((p) => p.verificationStatus === "approved"), [providers]);
  const pendingVerifications = useMemo(() => applications.filter((a) => ["submitted", "under_review"].includes(a.status)), [applications]);
  const todaysAppointments = useMemo(() => appointments.filter((a) => a.date === todayStr), [appointments, todayStr]);
  const grossTransactionValue = useMemo(() => payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0), [payments]);
  const platformRevenue = useMemo(() => settlements.reduce((s, x) => s + x.commissionAmount, 0), [settlements]);
  const openComplaints = useMemo(() => complaints.filter((c) => ["open", "investigating"].includes(c.status)), [complaints]);
  const expiringLicences = useMemo(() => {
    const now = Date.now();
    const limit = 90 * 86400000;
    return providers.filter((p) => {
      const exp = new Date(p.licenceExpiry).getTime();
      const diff = exp - now;
      return diff < limit;
    });
  }, [providers]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted/40 animate-pulse rounded-2xl" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const recentAudit = audit.slice(0, 4);
  void adminService;

  const actionNeededCount = pendingVerifications.length + openComplaints.length + expiringLicences.length;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Admin Console</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">Platform overview 👋</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Provider verification · pricing · settlements · compliance</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("admin", "audit")} className="shrink-0">
          <ScrollText className="h-4 w-4" /> Audit
        </Button>
      </div>

      {/* Hero: pending verifications */}
      {actionNeededCount > 0 ? (
        <button
          onClick={() => navigate("admin", "providers")}
          className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-left shadow-soft transition-all hover:shadow-soft-md active:scale-[0.99] tap-highlight-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-amber-100 p-2.5 shrink-0">
                <ClipboardCheck className="h-5 w-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 leading-tight">
                  {actionNeededCount} item{actionNeededCount === 1 ? "" : "s"} need attention
                </p>
                <p className="text-xs text-amber-700 mt-0.5 truncate">
                  {pendingVerifications.length} pending verifications · {openComplaints.length} open complaints · {expiringLicences.length} expiring licences
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-amber-700 shrink-0" />
          </div>
        </button>
      ) : (
        <button
          onClick={() => navigate("admin", "audit")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">All caught up</p>
              <p className="text-xl font-bold mt-1">Review audit trail</p>
              <p className="text-xs text-emerald-100/80 mt-1">Recent platform activity at a glance</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* StatTiles row */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Patients" value={patients.length} icon={Users} tone="info" onClick={() => navigate("admin", "users")} />
        <StatTile label="Providers" value={verifiedProviders.length} icon={Stethoscope} tone="success" onClick={() => navigate("admin", "providers")} />
        <StatTile label="Orders" value={orders.length} icon={Package} tone="warning" onClick={() => navigate("admin", "orders")} />
        <StatTile label="Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" onClick={() => navigate("admin", "settlements")} />
      </div>

      {/* Action needed list */}
      {(pendingVerifications.length > 0 || openComplaints.length > 0) && (
        <div className="space-y-2">
          <SectionLabel>Action needed</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {pendingVerifications.slice(0, 3).map((app) => {
              const provider = app.provider;
              return (
                <CompactListItem
                  key={app.id}
                  leading={
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                        {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  }
                  title={provider ? `${provider.title} ${provider.firstName} ${provider.lastName}` : app.providerId}
                  subtitle={`${provider?.specialty ?? "—"} · submitted ${relativeDay(app.submittedAt)}`}
                  trailing={<StatusBadge status={app.status} size="sm" />}
                  onClick={() => navigate("admin", "provider", { id: app.providerId })}
                  chevron
                />
              );
            })}
            {openComplaints.slice(0, 2).map((c) => (
              <CompactListItem
                key={c.id}
                leading={<div className="rounded-lg bg-rose-50 p-2 ring-1 ring-rose-100"><ShieldAlert className="h-4 w-4 text-rose-600" /></div>}
                title={c.subject}
                subtitle={`${c.complainantType} · ${relativeDay(c.createdAt)}`}
                trailing={<StatusBadge status={c.status} size="sm" />}
                onClick={() => navigate("admin", "complaints")}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* Secondary stats */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Today" value={todaysAppointments.length} icon={CalendarDays} tone="info" onClick={() => navigate("admin", "appointments")} />
        <StatTile label="Labs" value={labBookings.length} icon={FlaskConical} tone="violet" onClick={() => navigate("admin", "appointments")} />
        <StatTile label="Deliveries" value={deliveries.length} icon={Truck} tone="info" onClick={() => navigate("admin", "deliveries")} />
        <StatTile label="GTV" value={formatCurrency(grossTransactionValue)} icon={TrendingUp} tone="success" />
      </div>

      {/* Expiring licences alert */}
      {expiringLicences.length > 0 && (
        <button
          onClick={() => navigate("admin", "providers")}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left flex items-center gap-3 hover:bg-amber-100/60 transition-colors tap-highlight-none"
        >
          <div className="rounded-lg bg-amber-100 p-2 shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Expiring licences</p>
            <p className="text-xs text-amber-700 truncate">{expiringLicences.length} provider(s) with licences expiring within 90 days</p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700 shrink-0" />
        </button>
      )}

      {/* Recent audit compact list */}
      {recentAudit.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Recent activity</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {recentAudit.map((a) => (
              <CompactListItem
                key={a.id}
                leading={<div className="rounded-lg bg-muted p-2"><Clock className="h-4 w-4 text-muted-foreground" /></div>}
                title={a.description}
                subtitle={`${a.actorRole} · ${a.action.replace(/_/g, " ")}`}
                trailing={<span className="text-[10px] text-muted-foreground">{formatDateTime(a.timestamp)}</span>}
                onClick={() => navigate("admin", "audit")}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* More stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Primary patients" value={primaryPatients.length} icon={UserCheck} tone="success" onClick={() => navigate("admin", "users")} />
        <StatTile label="Verified providers" value={verifiedProviders.length} icon={BadgeCheck} tone="success" onClick={() => navigate("admin", "providers")} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{children}</p>;
}
