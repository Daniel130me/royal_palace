"use client";

import type { AdminDashboardResponse } from "@royal-palace/contracts";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Clock,
  FlaskConical,
  MessageSquareWarning,
  ScrollText,
  Stethoscope,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { ErrorState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMinorCurrency, relativeDay } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService } from "@/lib/services";

function currentDayRange(): { dayFrom: string; dayTo: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { dayFrom: from.toISOString(), dayTo: to.toISOString() };
}

export function AdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void administrationService
      .dashboard(currentDayRange())
      .then(setDashboard)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const paymentVolume = useMemo(
    () =>
      dashboard?.paymentVolume
        .map((total) => formatMinorCurrency(total.amountMinor, total.currency))
        .join(" · ") ?? "—",
    [dashboard],
  );

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null || dashboard === null)
    return <ErrorState message={error ?? "Dashboard response was empty."} onRetry={load} />;
  const attentionTotal =
    dashboard.attention.pendingApplications +
    dashboard.attention.openComplaints +
    dashboard.attention.expiringCredentials;
  const attentionDestination =
    dashboard.attention.openComplaints > 0
      ? "complaints"
      : dashboard.attention.pendingApplications > 0
        ? "applications"
        : dashboard.attention.expiringCredentials > 0
          ? "providers"
          : "audit";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Admin Console</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">Platform overview</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Operational facts from the production data boundary
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("admin", "audit")}>
          <ScrollText className="h-4 w-4" /> Audit
        </Button>
      </div>
      <button
        onClick={() => navigate("admin", attentionDestination)}
        className={`w-full rounded-2xl border p-4 text-left shadow-soft transition active:scale-[0.99] ${attentionTotal > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-white/70 p-2.5">
              {attentionTotal > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-700" />
              ) : (
                <ArrowRight className="h-5 w-5 text-emerald-700" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold">
                {attentionTotal > 0 ? `${attentionTotal} items need attention` : "All caught up"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {dashboard.attention.pendingApplications} pending applications ·{" "}
                {dashboard.attention.openComplaints} open complaints ·{" "}
                {dashboard.attention.expiringCredentials} expiring credentials
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
      </button>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Patients" value={dashboard.counts.patients} icon={Users} tone="info" />
        <StatTile
          label="Providers"
          value={dashboard.counts.verifiedPractitioners}
          icon={Stethoscope}
          tone="success"
          onClick={() => navigate("admin", "providers")}
        />
        <StatTile
          label="Today"
          value={dashboard.counts.appointmentsToday}
          icon={CalendarDays}
          tone="warning"
          onClick={() => navigate("admin", "appointments")}
        />
        <StatTile
          label="Payment volume"
          value={paymentVolume}
          icon={Wallet}
          tone="success"
          onClick={() => navigate("admin", "payments")}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label="Active deliveries"
          value={dashboard.counts.activeDeliveries}
          icon={Truck}
          tone="info"
          onClick={() => navigate("admin", "deliveries")}
        />
        <StatTile
          label="Laboratory bookings"
          value={dashboard.counts.laboratoryBookings}
          icon={FlaskConical}
          tone="violet"
        />
      </div>
      {dashboard.recentComplaints.length > 0 && (
        <DashboardSection title="Action needed">
          {dashboard.recentComplaints.map((complaint) => (
            <CompactListItem
              key={complaint.id}
              leading={
                <div className="rounded-lg bg-rose-50 p-2">
                  <MessageSquareWarning className="h-4 w-4 text-rose-600" />
                </div>
              }
              title={complaint.subject}
              subtitle={`${complaint.complaintNumber} · ${complaint.complainantType} · ${relativeDay(complaint.createdAt)}`}
              trailing={<StatusBadge status={complaint.status.toLowerCase()} size="sm" />}
              onClick={() => navigate("admin", "complaints")}
              chevron
            />
          ))}
        </DashboardSection>
      )}
      {dashboard.recentAuditEvents.length > 0 && (
        <DashboardSection title="Recent activity">
          {dashboard.recentAuditEvents.map((event) => (
            <CompactListItem
              key={event.id}
              leading={
                <div className="rounded-lg bg-muted p-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
              }
              title={event.action.replaceAll("_", " ")}
              subtitle={`${event.effectiveRole ?? "SYSTEM"} · ${event.resourceType}`}
              trailing={
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </span>
              }
              onClick={() => navigate("admin", "audit")}
              chevron
            />
          ))}
        </DashboardSection>
      )}
    </div>
  );
}

function DashboardSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
        {children}
      </div>
    </div>
  );
}
