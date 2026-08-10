"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { deliveryService } from "@/lib/services";
import type { Delivery } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
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
  PackageCheck, Navigation, AlertTriangle, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const todayDeliveredCount = completed.filter(isDeliveredToday).length;
  const pendingPayout = inTransit.reduce((acc, d) => acc + (d.payout || 0), 0) + pickupPhase.reduce((acc, d) => acc + (d.payout || 0), 0);

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
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted/40 animate-pulse rounded-2xl" />
        <SkeletonGrid count={4} />
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

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">{firstName} 👋</h1>
          {profile && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.vehicleType.toUpperCase()} · {profile.city}, {profile.state}</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("logistics", "assignments")} className="shrink-0">
          <Package className="h-4 w-4" /> Assignments
        </Button>
      </div>

      {/* Hero: spotlight (available assignment or active delivery) */}
      {spotlight ? (
        <SpotlightHero delivery={spotlight} busy={busy === spotlight.id} onProgress={(to) => progress(spotlight, to)} />
      ) : (
        <button
          onClick={() => navigate("logistics", "assignments")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">No active assignment</p>
              <p className="text-xl font-bold mt-1">Check for assignments</p>
              <p className="text-xs text-emerald-100/80 mt-1">Browse available pickups you can accept</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* StatTiles row */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Available" value={available.length} icon={Package} tone="warning" onClick={() => navigate("logistics", "assignments")} />
        <StatTile label="Active" value={pickupPhase.length + inTransit.length} icon={Truck} tone="info" onClick={() => navigate("logistics", "assignments")} />
        <StatTile label="Today" value={formatCurrency(todayEarnings)} icon={Wallet} tone="success" onClick={() => navigate("logistics", "earnings")} />
        <StatTile label="Pending" value={formatCurrency(pendingPayout)} icon={Clock} tone="warning" onClick={() => navigate("logistics", "earnings")} />
      </div>

      {/* Action needed: today's activity */}
      {(pickupPhase.length > 0 || inTransit.length > 0 || todayDeliveredCount > 0) && (
        <div className="space-y-2">
          <SectionLabel>Today's activity · {pickupPhase.length + inTransit.length + todayDeliveredCount}</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {pickupPhase.slice(0, 2).map((d) => (
              <CompactListItem
                key={d.id}
                leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><Navigation className="h-4 w-4 text-sky-600" /></div>}
                title={d.deliveryNumber}
                subtitle={`Pickup · ${d.pickupLocation} → ${d.deliveryLocation}`}
                trailing={
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatCurrency(d.payout)}</span>
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                }
                onClick={() => navigate("logistics", "delivery", { id: d.id })}
                chevron
              />
            ))}
            {inTransit.slice(0, 2).map((d) => (
              <CompactListItem
                key={d.id}
                leading={<div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100"><Truck className="h-4 w-4 text-violet-600" /></div>}
                title={d.deliveryNumber}
                subtitle={`En route → ${d.deliveryLocation} · ${d.recipientName}`}
                trailing={
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatCurrency(d.payout)}</span>
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                }
                onClick={() => navigate("logistics", "delivery", { id: d.id })}
                chevron
              />
            ))}
            {completed.filter(isDeliveredToday).slice(0, 2).map((d) => (
              <CompactListItem
                key={d.id}
                leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>}
                title={`Delivered · ${d.deliveryNumber}`}
                subtitle={`${d.recipientName} · ${d.deliveryLocation}`}
                trailing={
                  <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatCurrency(d.payout)}</span>
                }
                onClick={() => navigate("logistics", "delivery", { id: d.id })}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* My truck + deadline compact */}
      {profile && (
        <div className="grid grid-cols-2 gap-2.5">
          <SectionCard title="My truck" icon={Truck}>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground text-xs">Vehicle</dt>
                <dd className="font-medium uppercase text-xs">{profile.vehicleType}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground text-xs">Base</dt>
                <dd className="font-medium text-xs">{profile.city}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground text-xs">Status</dt>
                <StatusBadge status={profile.verificationStatus} size="sm" />
              </div>
            </dl>
          </SectionCard>

          {spotlight && (() => {
            const eta = estimatedEta(spotlight);
            return (
              <div className={cn("rounded-xl border p-3", eta.overdue ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50")}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-700 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Delivery deadline
                </p>
                <p className={cn("text-sm mt-1.5 font-medium", eta.overdue ? "text-rose-900" : "text-amber-900")}>{eta.label}</p>
                {eta.overdue && (
                  <p className="text-xs text-rose-700 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" /> Past window
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Completed today" value={todayDeliveredCount} icon={PackageCheck} tone="success" onClick={() => navigate("logistics", "history")} />
        <StatTile label="Total completed" value={completed.length} icon={CheckCircle2} tone="info" onClick={() => navigate("logistics", "history")} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{children}</p>;
}

function SpotlightHero({ delivery, busy, onProgress }: { delivery: Delivery; busy: boolean; onProgress: (to: Delivery["status"]) => void }) {
  const quick = QUICK_ACTION[delivery.status];
  const isAvailable = delivery.status === "assigned";
  return (
    <div className={cn(
      "w-full rounded-2xl border-2 p-4 shadow-soft",
      isAvailable ? "border-amber-300 bg-amber-50" : "border-border/60 bg-card"
    )}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold truncate">{delivery.deliveryNumber}</p>
            {isAvailable && (
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 text-[10px] h-5">
                Available now
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {delivery.packageType.replace(/_/g, " ")} · Order {delivery.order?.orderNumber ?? delivery.orderId}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Payout</p>
          <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(delivery.payout)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Pickup</p>
          <p className="text-xs font-medium mt-0.5 truncate">{delivery.pickupLocation}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
          <p className="text-[10px] text-emerald-700 flex items-center gap-1"><MapPin className="h-3 w-3" /> Drop-off</p>
          <p className="text-xs font-medium mt-0.5 truncate">{delivery.deliveryLocation}</p>
        </div>
      </div>

      {delivery.handlingInstruction && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
          <p className="text-[10px] text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Handling</p>
          <p className="text-xs mt-0.5 italic text-amber-900">{delivery.handlingInstruction}</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {quick && (
          <Button className="flex-1" size="sm" disabled={busy} onClick={() => onProgress(quick.to)}>
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
        )}
        <Button variant="outline" size="sm" onClick={() => navigate("logistics", "delivery", { id: delivery.id })}>
          Details <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
