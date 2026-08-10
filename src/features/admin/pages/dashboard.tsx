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
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, formatDateTime, relativeDay, initials } from "@/lib/format";
import {
  Users, UserCheck, Stethoscope, ClipboardCheck, CalendarDays, FlaskConical,
  Package, Truck, Wallet, TrendingUp, AlertCircle, ShieldAlert, ScrollText,
  BadgeCheck, Clock, ArrowRight,
} from "lucide-react";

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
  const providerPayouts = useMemo(() => settlements.filter((s) => s.entityType === "provider").reduce((s, x) => s + x.netAmount, 0), [settlements]);
  const refundsTotal = useMemo(() => payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0), [payments]);
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
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const recentAudit = audit.slice(0, 8);
  void adminService;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Console"
        description="Platform oversight · provider verification · pricing · settlements · compliance."
        actions={
          <Button variant="outline" onClick={() => navigate("admin", "audit")}>
            <ScrollText className="h-4 w-4" /> View audit trail
          </Button>
        }
      />

      {/* Network metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total Patients" value={patients.length} icon={Users} tone="info" hint={`${primaryPatients.length} primary · ${patients.length - primaryPatients.length} dependants`} onClick={() => navigate("admin", "users")} />
        <MetricCard label="Active Patients" value={primaryPatients.length} icon={UserCheck} tone="success" hint="Primary accounts" />
        <MetricCard label="Verified Providers" value={verifiedProviders.length} icon={BadgeCheck} tone="success" hint={`${providers.length} total`} onClick={() => navigate("admin", "providers")} />
        <MetricCard label="Pending Verifications" value={pendingVerifications.length} icon={ClipboardCheck} tone="warning" hint="Applications in review" onClick={() => navigate("admin", "providers")} />
      </div>

      {/* Activity metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Today's Consultations" value={todaysAppointments.length} icon={CalendarDays} tone="info" hint="Scheduled today" onClick={() => navigate("admin", "appointments")} />
        <MetricCard label="Laboratory Bookings" value={labBookings.length} icon={FlaskConical} tone="violet" onClick={() => navigate("admin", "appointments")} />
        <MetricCard label="Pharmacy Orders" value={orders.length} icon={Package} tone="warning" onClick={() => navigate("admin", "orders")} />
        <MetricCard label="Deliveries" value={deliveries.length} icon={Truck} tone="info" onClick={() => navigate("admin", "deliveries")} />
      </div>

      {/* Finance metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Gross Transaction Value" value={formatCurrency(grossTransactionValue)} icon={TrendingUp} tone="success" hint="Successful payments" />
        <MetricCard label="Platform Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" hint="Commission earned" onClick={() => navigate("admin", "settlements")} />
        <MetricCard label="Provider Payouts" value={formatCurrency(providerPayouts)} icon={Wallet} tone="info" hint="Net to providers" onClick={() => navigate("admin", "settlements")} />
        <MetricCard label="Refunds" value={formatCurrency(refundsTotal)} icon={AlertCircle} tone={refundsTotal > 0 ? "danger" : "default"} hint="Refunded payments" />
      </div>

      {/* Mini metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Open complaints" value={openComplaints.length} tone={openComplaints.length > 0 ? "warning" : "success"} />
        <MiniMetric label="Expiring licences" value={expiringLicences.length} tone={expiringLicences.length > 0 ? "danger" : "success"} />
        <MiniMetric label="Audit events" value={audit.length} tone="info" />
        <MiniMetric label="Avg ticket" value={formatCurrency(payments.length ? grossTransactionValue / payments.length : 0)} tone="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Pending provider verifications"
          icon={ClipboardCheck}
          action={<Button variant="ghost" size="sm" onClick={() => navigate("admin", "providers")}>View all</Button>}
          dense
        >
          <ul className="divide-y divide-border/60 max-h-96 overflow-y-auto">
            {pendingVerifications.length === 0 ? (
              <li><EmptyState icon={BadgeCheck} title="Nothing pending" description="All provider applications have been reviewed." compact /></li>
            ) : pendingVerifications.map((app) => {
              const provider = app.provider;
              return (
                <li key={app.id}>
                  <button
                    onClick={() => navigate("admin", "provider", { id: app.providerId })}
                    className="w-full text-left p-4 hover:bg-accent/40 transition-colors tap-highlight-none flex items-center gap-3"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                        {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {provider ? `${provider.title} ${provider.firstName} ${provider.lastName}` : app.providerId}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{provider?.specialty ?? "—"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Submitted {relativeDay(app.submittedAt)}</p>
                        </div>
                        <StatusBadge status={app.status} size="sm" />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent activity"
          icon={ScrollText}
          action={<Button variant="ghost" size="sm" onClick={() => navigate("admin", "audit")}>Full audit trail</Button>}
          dense
          className="lg:col-span-2"
        >
          <ul className="divide-y divide-border/60 max-h-96 overflow-y-auto">
            {recentAudit.length === 0 ? (
              <li className="text-sm text-muted-foreground py-8 text-center">No audit events recorded.</li>
            ) : recentAudit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-4 text-sm">
                <div className="rounded-md bg-muted p-1.5 shrink-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{a.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium capitalize">{a.actorRole}</span> · {a.actorId} · {a.action.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.timestamp)}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Open complaints"
          icon={ShieldAlert}
          action={<Button variant="ghost" size="sm" onClick={() => navigate("admin", "complaints")}>Manage</Button>}
          dense
        >
          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
            {openComplaints.length === 0 ? (
              <li><EmptyState icon={ShieldAlert} title="No open complaints" description="All complaints are resolved or closed." compact /></li>
            ) : openComplaints.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => navigate("admin", "complaints")}
                  className="w-full text-left p-4 hover:bg-accent/40 transition-colors tap-highlight-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.complainantType} · {relativeDay(c.createdAt)}</p>
                    </div>
                    <StatusBadge status={c.status} size="sm" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Expiring licences"
          icon={AlertCircle}
          action={<Button variant="ghost" size="sm" onClick={() => navigate("admin", "providers")}>All providers</Button>}
          dense
          className={expiringLicences.length > 0 ? "border-amber-200" : ""}
        >
          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
            {expiringLicences.length === 0 ? (
              <li><EmptyState icon={BadgeCheck} title="No licences expiring soon" description="All provider licences are valid for 90+ days." compact /></li>
            ) : expiringLicences.map((p) => {
              const days = Math.ceil((new Date(p.licenceExpiry).getTime() - Date.now()) / 86400000);
              const critical = days < 30;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => navigate("admin", "provider", { id: p.id })}
                    className="w-full text-left p-4 hover:bg-accent/40 transition-colors tap-highlight-none flex items-center gap-3"
                  >
                    <div className={`rounded-md p-2 shrink-0 ${critical ? "bg-rose-100" : "bg-amber-100"}`}>
                      <AlertCircle className={`h-4 w-4 ${critical ? "text-rose-600" : "text-amber-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{p.title} {p.firstName} {p.lastName}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.specialty} · Licence {p.licenceNumber}</p>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-1 shrink-0 ${critical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                          {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
