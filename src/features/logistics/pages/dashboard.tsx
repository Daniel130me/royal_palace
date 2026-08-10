"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { deliveryService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import {
  formatCurrency,
  formatDateTime,
  isDeliveredToday,
  estimatedEta,
  QUICK_ACTION,
} from "../delivery-helpers";
import { toast } from "sonner";
import {
  Package, Truck, MapPin, CheckCircle2, Wallet, Clock, ArrowRight,
  PackageCheck, Navigation, AlertTriangle, Bell,
} from "lucide-react";

export function LogisticsDashboard() {
  const { sessionName } = useNav();
  const {
    logisticsId,
    profile,
    deliveries,
    available,
    pickupPhase,
    inTransit,
    completed,
    notifications,
    loading,
    error,
    refresh,
  } = useLogisticsContext();
  const [busy, setBusy] = useState<string | null>(null);

  const spotlight = useMemo<Delivery | null>(() => {
    if (inTransit.length) {
      const atDest = inTransit.find((d) => d.status === "arrived_at_destination");
      return atDest ?? inTransit[0];
    }
    if (pickupPhase.length) return pickupPhase[0];
    if (available.length) return available[0];
    return null;
  }, [inTransit, pickupPhase, available]);

  const todayEarnings = useMemo(
    () => completed.filter(isDeliveredToday).reduce((acc, d) => acc + (d.payout || 0), 0),
    [completed]
  );

  useEffect(() => {
    if (logisticsId) refresh();
  }, [logisticsId, refresh]);

  async function progress(delivery: Delivery, to: Delivery["status"]) {
    if (!logisticsId) return;
    setBusy(delivery.id);
    try {
      await deliveryService.progress(delivery.id, to, "", logisticsId);
      toast.success(`Delivery ${delivery.deliveryNumber} updated to "${to.replace(/_/g, " ")}".`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update delivery.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && deliveries.length === 0 && !error) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 h-72 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-72 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => { refresh(); }}
      />
    );
  }

  const firstName = (profile?.name ?? sessionName).split(" ")[0];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const quickActions = [
    { label: "Assignments", sub: "Available + active", icon: Package, page: "assignments", tone: "text-amber-600" as const },
    { label: "History", sub: "Past deliveries", icon: PackageCheck, page: "history", tone: "text-emerald-600" as const },
    { label: "Earnings", sub: "Payouts", icon: Wallet, page: "earnings", tone: "text-violet-600" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={
          profile
            ? `${profile.name} · ${profile.vehicleType.toUpperCase()} · ${profile.city}, ${profile.state}`
            : "Your logistics dashboard"
        }
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "assignments")}>
            <Package className="h-4 w-4" /> View all assignments
          </Button>
        }
      />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate("logistics", a.page as any)}
            className="group rounded-2xl border border-border/80 bg-card p-3 text-left shadow-soft hover:shadow-soft-md hover:border-primary/30 transition-all tap-highlight-none"
          >
            <div className="rounded-xl bg-muted/60 p-2 w-fit group-hover:bg-primary/10 transition-colors">
              <a.icon className={`h-4 w-4 ${a.tone}`} />
            </div>
            <p className="text-xs font-semibold mt-2 leading-tight">{a.label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">{a.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Available" value={available.length} icon={Package} tone="warning" hint="Awaiting your acceptance" onClick={() => navigate("logistics", "assignments")} />
        <MetricCard label="Active" value={pickupPhase.length + inTransit.length} icon={Truck} tone="info" hint="Pickup + in-transit" onClick={() => navigate("logistics", "assignments", { tab: "active" })} />
        <MetricCard label="Today's earnings" value={formatCurrency(todayEarnings)} icon={Wallet} tone="success" hint={`${completed.filter(isDeliveredToday).length} delivered today`} onClick={() => navigate("logistics", "earnings")} />
        <MetricCard label="Pending payouts" value={formatCurrency(
          inTransit.reduce((acc, d) => acc + (d.payout || 0), 0) +
          pickupPhase.reduce((acc, d) => acc + (d.payout || 0), 0)
        )} icon={Clock} hint="Pending on completion" onClick={() => navigate("logistics", "earnings")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Spotlight — available assignment or active delivery */}
          <SectionCard
            title={spotlight?.status === "assigned" ? "Available assignment" : "Current delivery"}
            icon={Navigation}
            action={spotlight ? <Button variant="ghost" size="sm" onClick={() => navigate("logistics", "delivery", { id: spotlight.id })}>Open detail <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button> : undefined}
          >
            {spotlight ? (
              <SpotlightCard delivery={spotlight} busy={busy === spotlight.id} onProgress={(to) => progress(spotlight, to)} />
            ) : (
              <EmptyState
                icon={PackageCheck}
                title="No active assignment"
                description={
                  available.length === 0
                    ? "You have no pending deliveries right now. New assignments will appear here."
                    : "Accept an available assignment to begin a delivery."
                }
                action={
                  available.length > 0 ? (
                    <Button onClick={() => navigate("logistics", "assignments", { tab: "available" })}>
                      View available ({available.length})
                    </Button>
                  ) : undefined
                }
                compact
              />
            )}
          </SectionCard>

          <SectionCard
            title="Today's activity"
            icon={Clock}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("logistics", "history")}>History <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>}
            dense
          >
            {completed.filter(isDeliveredToday).length === 0 &&
            pickupPhase.length + inTransit.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Clock}
                  title="No deliveries today yet"
                  description="Today's pickup and completed deliveries will show up here."
                  compact
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {completed.filter(isDeliveredToday).map((d) => (
                  <DeliveryRow key={d.id} delivery={d} showEarnings />
                ))}
                {pickupPhase.map((d) => (
                  <DeliveryRow key={d.id} delivery={d} />
                ))}
                {inTransit.map((d) => (
                  <DeliveryRow key={d.id} delivery={d} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="My truck" icon={Truck}>
            {profile ? (
              <dl className="text-sm space-y-2.5">
                <div className="flex justify-between"><dt className="text-muted-foreground">Logistics No.</dt><dd className="font-medium font-mono text-xs">{profile.logisticsNumber}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Vehicle</dt><dd className="font-medium uppercase">{profile.vehicleType}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Base</dt><dd className="font-medium">{profile.city}, {profile.state}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{profile.phone}</dd></div>
                <div className="flex justify-between items-center"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={profile.verificationStatus} size="sm" /></dd></div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Profile unavailable.</p>
            )}
          </SectionCard>

          {spotlight && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" /> Delivery deadline
                </p>
                {(() => {
                  const eta = estimatedEta(spotlight);
                  return (
                    <>
                      <p className="text-sm mt-1.5 font-medium text-amber-900">{eta.label}</p>
                      {eta.overdue && (
                        <p className="text-xs text-rose-700 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> Past estimated window
                        </p>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Mini stats row */}
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Completed today" value={completed.filter(isDeliveredToday).length} tone="success" />
            <MiniMetric label="Total completed" value={completed.length} tone="info" />
          </div>

          <SectionCard
            title="Notifications"
            icon={Bell}
            action={unreadCount > 0 ? (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 h-6">{unreadCount}</Badge>
            ) : undefined}
            dense
          >
            <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="text-sm text-muted-foreground py-6 text-center">No notifications.</li>
              ) : (
                notifications.slice(0, 6).map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 sm:px-5 py-3 ${n.read ? "" : "bg-primary/[0.03]"}`}
                  >
                    <p className="font-medium text-xs leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                  </li>
                ))
              )}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function SpotlightCard({
  delivery,
  busy,
  onProgress,
}: {
  delivery: Delivery;
  busy: boolean;
  onProgress: (to: Delivery["status"]) => void;
}) {
  const quick = QUICK_ACTION[delivery.status];
  const isAvailable = delivery.status === "assigned";

  return (
    <div className={`rounded-xl border bg-card p-4 sm:p-5 ${isAvailable ? "border-amber-200 bg-amber-50/30 ring-1 ring-amber-100" : "border-border/60"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{delivery.deliveryNumber}</p>
            <StatusBadge status={delivery.status} size="sm" />
            <span className="text-xs text-muted-foreground capitalize">
              {delivery.packageType.replace(/_/g, " ")} package
            </span>
            {isAvailable && (
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 text-[10px] h-5">
                Available now
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Linked order: {delivery.order?.orderNumber ?? delivery.orderId}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Payout</p>
          <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(delivery.payout)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Pickup
          </p>
          <p className="text-sm font-medium mt-1">{delivery.pickupLocation}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Contact: {delivery.pickupContact}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Drop-off
          </p>
          <p className="text-sm font-medium mt-1">{delivery.deliveryLocation}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Recipient: {delivery.recipientName}</p>
        </div>
      </div>

      {delivery.handlingInstruction && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Handling instruction
          </p>
          <p className="text-sm mt-1">{delivery.handlingInstruction}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {quick ? (
          <Button disabled={busy} onClick={() => onProgress(quick.to)}>
            {busy ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Updating…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> {quick.label}
              </>
            )}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => navigate("logistics", "delivery", { id: delivery.id })}>
          Full workflow <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery, showEarnings = false }: { delivery: Delivery; showEarnings?: boolean }) {
  return (
    <li>
      <button
        onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
        className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-accent/40 transition-colors tap-highlight-none"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 ring-1 ring-violet-100 shrink-0">
          <Truck className="h-4 w-4 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{delivery.deliveryNumber}</p>
            <StatusBadge status={delivery.status} size="sm" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {delivery.deliveryLocation}
          </p>
        </div>
        <div className="text-right shrink-0 ml-2">
          {showEarnings ? (
            <>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Payout</p>
              <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(delivery.payout)}</p>
            </>
          ) : (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
    </li>
  );
}
