"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { deliveryService, logisticsService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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

  // Pick the most pressing "active" delivery to feature in the spotlight card.
  // Priority: in-transit > arrived-at-destination > picked-up > pickup-phase > available.
  const spotlight = useMemo<Delivery | null>(() => {
    if (inTransit.length) {
      // arrived_at_destination is highest priority within in-transit group
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

  // Force a refresh whenever the user lands on the dashboard, so the spotlight
  // reflects the latest state.
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
    return <LoadingState label="Loading logistics dashboard…" />;
  }
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          refresh();
        }}
      />
    );
  }

  const firstName = (profile?.name ?? sessionName).split(" ")[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={
          profile
            ? `${profile.name} · ${profile.vehicleType.toUpperCase()} · ${profile.city}, ${profile.state}`
            : "Your logistics dashboard"
        }
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "assignments")}>
            <Package className="h-4 w-4 mr-1" /> View all assignments
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Available"
          value={available.length}
          icon={Package}
          tone="warning"
          hint="Awaiting your acceptance"
          onClick={() => navigate("logistics", "assignments")}
        />
        <MetricCard
          label="Active"
          value={pickupPhase.length + inTransit.length}
          icon={Truck}
          tone="info"
          hint="Pickup + in-transit"
          onClick={() => navigate("logistics", "assignments", { tab: "active" })}
        />
        <MetricCard
          label="Today's Earnings"
          value={formatCurrency(todayEarnings)}
          icon={Wallet}
          tone="success"
          hint={`${completed.filter(isDeliveredToday).length} delivered today`}
          onClick={() => navigate("logistics", "earnings")}
        />
        <MetricCard
          label="Pending Payouts"
          value={formatCurrency(
            inTransit.reduce((acc, d) => acc + (d.payout || 0), 0) +
              pickupPhase.reduce((acc, d) => acc + (d.payout || 0), 0)
          )}
          icon={Clock}
          tone="default"
          hint="Pending on completion"
          onClick={() => navigate("logistics", "earnings")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Spotlight card */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="h-4 w-4 text-emerald-600" />
                Current assignment
              </CardTitle>
              {spotlight && (
                <Button variant="ghost" size="sm" onClick={() => navigate("logistics", "delivery", { id: spotlight.id })}>
                  Open detail <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {spotlight ? (
                <SpotlightCard
                  delivery={spotlight}
                  busy={busy === spotlight.id}
                  onProgress={(to) => progress(spotlight, to)}
                />
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
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("logistics", "assignments", { tab: "available" })}>
                        View available ({available.length})
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Today's deliveries summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Today&rsquo;s activity</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("logistics", "history")}>
                History <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {completed.filter(isDeliveredToday).length === 0 &&
              pickupPhase.length + inTransit.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No deliveries today yet.</p>
              ) : (
                <>
                  {completed.filter(isDeliveredToday).map((d) => (
                    <DeliveryRow key={d.id} delivery={d} showEarnings />
                  ))}
                  {pickupPhase.map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                  {inTransit.map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Profile / Truck */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" /> My truck
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {profile ? (
                <>
                  <Row label="Logistics No." value={profile.logisticsNumber} />
                  <Row label="Vehicle" value={profile.vehicleType.toUpperCase()} />
                  <Row label="Base" value={`${profile.city}, ${profile.state}`} />
                  <Row label="Phone" value={profile.phone} />
                  <Row label="Status" value={<StatusBadge status={profile.verificationStatus} />} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Profile unavailable.</p>
              )}
            </CardContent>
          </Card>

          {/* ETA / deadline */}
          {spotlight && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Delivery deadline
                </p>
                {(() => {
                  const eta = estimatedEta(spotlight);
                  return (
                    <>
                      <p className="text-sm mt-1 font-medium">{eta.label}</p>
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

          {/* Notifications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Bell className="h-4 w-4" /> Notifications
              </CardTitle>
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="text-xs bg-rose-500 text-white rounded-full px-2 py-0.5">
                  {notifications.filter((n) => !n.read).length}
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No notifications.</p>
              ) : (
                notifications.slice(0, 6).map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-lg p-3 text-sm ${n.read ? "bg-muted/40" : "bg-emerald-50/50 border border-emerald-100"}`}
                  >
                    <p className="font-medium text-xs">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
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

  return (
    <div className="rounded-lg border p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{delivery.deliveryNumber}</p>
            <StatusBadge status={delivery.status} />
            <span className="text-xs text-muted-foreground capitalize">
              {delivery.packageType.replace(/_/g, " ")} package
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Linked order: {delivery.order?.orderNumber ?? delivery.orderId}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Payout</p>
          <p className="text-lg font-bold text-emerald-700">{formatCurrency(delivery.payout)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Pickup
          </p>
          <p className="text-sm font-medium mt-1">{delivery.pickupLocation}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Contact: {delivery.pickupContact}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Drop-off
          </p>
          <p className="text-sm font-medium mt-1">{delivery.deliveryLocation}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Recipient: {delivery.recipientName}</p>
        </div>
      </div>

      {delivery.handlingInstruction && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Handling instruction
          </p>
          <p className="text-sm mt-1">{delivery.handlingInstruction}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {quick ? (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={busy}
            onClick={() => onProgress(quick.to)}
          >
            {busy ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white mr-2" />
                Updating…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" /> {quick.label}
              </>
            )}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => navigate("logistics", "delivery", { id: delivery.id })}>
          Full workflow
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery, showEarnings = false }: { delivery: Delivery; showEarnings?: boolean }) {
  return (
    <button
      onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
      className="w-full text-left flex items-center justify-between rounded-lg border p-3 hover:border-emerald-400 hover:shadow-sm transition-all"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{delivery.deliveryNumber}</p>
          <StatusBadge status={delivery.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {delivery.deliveryLocation}
        </p>
      </div>
      <div className="text-right shrink-0 ml-2">
        {showEarnings ? (
          <>
            <p className="text-xs text-muted-foreground">Payout</p>
            <p className="text-sm font-semibold text-emerald-700">{formatCurrency(delivery.payout)}</p>
          </>
        ) : (
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
