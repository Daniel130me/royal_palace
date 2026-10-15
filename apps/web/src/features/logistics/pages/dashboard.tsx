"use client";

import { ArrowRight, CheckCircle2, MapPin, Package, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { ErrorState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { navigate, useNav } from "@/lib/nav";

import { formatAddress, QUICK_ACTION, statusForBadge } from "../delivery-helpers";
import type { LogisticsDelivery, MutableLogisticsDeliveryStatus } from "../logistics-types";
import { useLogisticsContext } from "../use-logistics-context";

export function LogisticsDashboard() {
  const { sessionName } = useNav();
  const {
    active,
    available,
    completed,
    deliveries,
    error,
    inTransit,
    loading,
    organizationName,
    pickupPhase,
    refresh,
    transition,
    unread,
  } = useLogisticsContext({ loadUnread: true });
  const [busy, setBusy] = useState<string | null>(null);

  const spotlight = useMemo(
    () =>
      inTransit.find((delivery) => delivery.status === "ARRIVED_AT_DESTINATION") ??
      inTransit[0] ??
      pickupPhase[0] ??
      available[0] ??
      null,
    [available, inTransit, pickupPhase],
  );

  async function progress(delivery: LogisticsDelivery, toStatus: MutableLogisticsDeliveryStatus) {
    setBusy(delivery.id);
    try {
      await transition(delivery, toStatus);
      toast.success(
        `${delivery.deliveryNumber} updated to ${toStatus.replaceAll("_", " ").toLowerCase()}.`,
      );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The delivery could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && deliveries.length === 0 && error === null) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted/40" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error !== null) return <ErrorState message={error} onRetry={() => void refresh()} />;

  const firstName = (sessionName || organizationName || "Logistics").split(" ")[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{firstName}</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{organizationName}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("logistics", "assignments")}>
          <Package className="h-4 w-4" /> Assignments
        </Button>
      </div>

      {spotlight ? (
        <SpotlightHero
          busy={busy === spotlight.id}
          delivery={spotlight}
          onProgress={(status) => void progress(spotlight, status)}
        />
      ) : (
        <button
          type="button"
          onClick={() => navigate("logistics", "assignments")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">No active assignment</p>
              <p className="mt-1 text-xl font-bold">Check for assignments</p>
              <p className="mt-1 text-xs text-emerald-100/80">
                New pharmacy handoffs will appear here.
              </p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          label="Available"
          value={available.length}
          icon={Package}
          tone="warning"
          onClick={() => navigate("logistics", "assignments", { tab: "available" })}
        />
        <StatTile
          label="Active"
          value={active.length}
          icon={Truck}
          tone="info"
          onClick={() => navigate("logistics", "assignments", { tab: "active" })}
        />
        <StatTile
          label="Completed"
          value={completed.length}
          icon={CheckCircle2}
          tone="success"
          onClick={() => navigate("logistics", "history")}
        />
        <StatTile label="Unread" value={unread} icon={Package} tone="info" />
      </div>

      {active.length > 0 && (
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active deliveries
          </p>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
            {active.slice(0, 4).map((delivery) => (
              <CompactListItem
                key={delivery.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
                    <Truck className="h-4 w-4 text-sky-600" />
                  </div>
                }
                title={delivery.deliveryNumber}
                subtitle={`${delivery.pickupLocationName} → ${delivery.deliveryAddress.locality}`}
                trailing={<StatusBadge status={statusForBadge(delivery.status)} size="sm" />}
                onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
                chevron
              />
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Earnings are recorded separately from delivery status. Open Earnings to view immutable
        finance facts; a browser status change never creates or calculates a payout.
      </div>
    </div>
  );
}

function SpotlightHero({
  busy,
  delivery,
  onProgress,
}: {
  busy: boolean;
  delivery: LogisticsDelivery;
  onProgress: (status: MutableLogisticsDeliveryStatus) => void;
}) {
  const quick = QUICK_ACTION[delivery.status];
  return (
    <div className="w-full rounded-2xl border-2 border-border/60 bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{delivery.deliveryNumber}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Order {delivery.orderNumber} · {delivery.handoffReference}
          </p>
        </div>
        <StatusBadge status={statusForBadge(delivery.status)} size="sm" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> Pickup
          </p>
          <p className="mt-0.5 truncate text-xs font-medium">{delivery.pickupLocationName}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100">
          <p className="flex items-center gap-1 text-[10px] text-emerald-700">
            <MapPin className="h-3 w-3" /> Drop-off
          </p>
          <p className="mt-0.5 truncate text-xs font-medium">
            {formatAddress(delivery.deliveryAddress)}
          </p>
        </div>
      </div>
      {delivery.deliveryInstruction && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900">
          {delivery.deliveryInstruction}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {quick && (
          <Button className="flex-1" size="sm" disabled={busy} onClick={() => onProgress(quick.to)}>
            {busy ? "Updating…" : quick.label}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
        >
          Details <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
