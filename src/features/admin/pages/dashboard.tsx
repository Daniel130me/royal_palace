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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, formatDateTime, relativeDay } from "@/lib/format";
import {
  Users, UserCheck, Stethoscope, ClipboardCheck, CalendarDays, FlaskConical,
  Package, Truck, Wallet, TrendingUp, AlertCircle, ShieldAlert, ScrollText,
  BadgeCheck, Clock,
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
  const primaryPatients = useMemo(
    () => patients.filter((p) => !p.parentPatientId),
    [patients]
  );
  const verifiedProviders = useMemo(
    () => providers.filter((p) => p.verificationStatus === "approved"),
    [providers]
  );
  const pendingVerifications = useMemo(
    () => applications.filter((a) => ["submitted", "under_review"].includes(a.status)),
    [applications]
  );
  const todaysAppointments = useMemo(
    () => appointments.filter((a) => a.date === todayStr),
    [appointments, todayStr]
  );
  const grossTransactionValue = useMemo(
    () => payments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const platformRevenue = useMemo(
    () => settlements.reduce((s, x) => s + x.commissionAmount, 0),
    [settlements]
  );
  const providerPayouts = useMemo(
    () => settlements.filter((s) => s.entityType === "provider").reduce((s, x) => s + x.netAmount, 0),
    [settlements]
  );
  const refundsTotal = useMemo(
    () => payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const openComplaints = useMemo(
    () => complaints.filter((c) => ["open", "investigating"].includes(c.status)),
    [complaints]
  );
  const expiringLicences = useMemo(() => {
    const now = Date.now();
    const limit = 90 * 86400000;
    return providers.filter((p) => {
      const exp = new Date(p.licenceExpiry).getTime();
      const diff = exp - now;
      return diff < limit;
    });
  }, [providers]);

  if (loading) return <LoadingState label="Loading admin console…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const recentAudit = audit.slice(0, 8);
  // silence unused import warnings — these are referenced via re-export for parity
  void adminService;

  return (
    <div>
      <PageHeader
        title="Admin Console"
        description="Platform oversight · provider verification · pricing · settlements · compliance."
        actions={
          <Button variant="outline" onClick={() => navigate("admin", "audit")}>
            <ScrollText className="h-4 w-4 mr-1" /> View audit trail
          </Button>
        }
      />

      {/* Top metrics — network */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Total Patients" value={patients.length} icon={Users} tone="info" hint={`${primaryPatients.length} primary · ${patients.length - primaryPatients.length} dependants`} onClick={() => navigate("admin", "users")} />
        <MetricCard label="Active Patients" value={primaryPatients.length} icon={UserCheck} tone="success" hint="Primary accounts" />
        <MetricCard label="Verified Providers" value={verifiedProviders.length} icon={BadgeCheck} tone="success" hint={`${providers.length} total`} onClick={() => navigate("admin", "providers")} />
        <MetricCard label="Pending Verifications" value={pendingVerifications.length} icon={ClipboardCheck} tone="warning" hint="Applications in review" onClick={() => navigate("admin", "providers")} />
      </div>

      {/* Activity metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Today's Consultations" value={todaysAppointments.length} icon={CalendarDays} tone="info" hint="Scheduled today" onClick={() => navigate("admin", "appointments")} />
        <MetricCard label="Laboratory Bookings" value={labBookings.length} icon={FlaskConical} tone="info" onClick={() => navigate("admin", "appointments")} />
        <MetricCard label="Pharmacy Orders" value={orders.length} icon={Package} tone="info" onClick={() => navigate("admin", "orders")} />
        <MetricCard label="Deliveries" value={deliveries.length} icon={Truck} tone="info" onClick={() => navigate("admin", "deliveries")} />
      </div>

      {/* Finance metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Gross Transaction Value" value={formatCurrency(grossTransactionValue)} icon={TrendingUp} tone="success" hint="Successful payments" />
        <MetricCard label="Platform Revenue" value={formatCurrency(platformRevenue)} icon={Wallet} tone="success" hint="Commission earned" onClick={() => navigate("admin", "settlements")} />
        <MetricCard label="Provider Payouts" value={formatCurrency(providerPayouts)} icon={Wallet} tone="info" hint="Net to providers" onClick={() => navigate("admin", "settlements")} />
        <MetricCard label="Refunds" value={formatCurrency(refundsTotal)} icon={AlertCircle} tone={refundsTotal > 0 ? "danger" : "default"} hint="Refunded payments" />
      </div>

      {/* Lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pending verifications */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Pending provider verifications</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("admin", "providers")}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {pendingVerifications.length === 0 ? (
              <EmptyState icon={BadgeCheck} title="Nothing pending" description="All provider applications have been reviewed." />
            ) : pendingVerifications.map((app) => {
              const provider = app.provider;
              return (
                <button
                  key={app.id}
                  onClick={() => navigate("admin", "provider", { id: app.providerId })}
                  className="w-full text-left rounded-lg border p-3 hover:border-emerald-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {provider ? `${provider.title} ${provider.firstName} ${provider.lastName}` : app.providerId}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{provider?.specialty ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Submitted {relativeDay(app.submittedAt)}</p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent audit */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-1.5"><ScrollText className="h-4 w-4" /> Recent activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("admin", "audit")}>Full audit trail</Button>
          </CardHeader>
          <CardContent className="space-y-1 max-h-96 overflow-y-auto">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No audit events recorded.</p>
            ) : recentAudit.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
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
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Complaints + expiring licences */}
      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Open complaints</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("admin", "complaints")}>Manage</Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {openComplaints.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No open complaints" description="All complaints are resolved or closed." />
            ) : openComplaints.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate("admin", "complaints")}
                className="w-full text-left rounded-lg border p-3 hover:border-amber-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.complainantType} · {formatDate(c.createdAt)}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> Expiring licences</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("admin", "providers")}>All providers</Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {expiringLicences.length === 0 ? (
              <EmptyState icon={BadgeCheck} title="No licences expiring soon" description="All provider licences are valid for 90+ days." />
            ) : expiringLicences.map((p) => {
              const days = Math.ceil((new Date(p.licenceExpiry).getTime() - Date.now()) / 86400000);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate("admin", "provider", { id: p.id })}
                  className="w-full text-left rounded-lg border p-3 hover:border-amber-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.title} {p.firstName} {p.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.specialty} · Licence {p.licenceNumber}</p>
                    </div>
                    <span className={`text-xs font-medium rounded-full px-2 py-1 ${days < 0 ? "bg-rose-100 text-rose-700" : days < 30 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
