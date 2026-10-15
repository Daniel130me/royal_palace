"use client";

import type { LogisticsComponents, PrescriptionComponents } from "@royal-palace/api-client";
import { Truck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDateTime } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { productionLogisticsService, productionPrescriptionService } from "@/lib/services";

type Handoff = PrescriptionComponents["schemas"]["PharmacyDelivery"];
type Tracking = LogisticsComponents["schemas"]["PharmacyDelivery"];

export function PharmacyDeliveries() {
  const organizationId = useNav().session?.profileId;
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session.");
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      productionPrescriptionService.pharmacy.deliveries(organizationId),
      productionLogisticsService.pharmacy.list(organizationId, { limit: 50 }),
    ])
      .then(([handoffPage, trackingPage]) => {
        setHandoffs([...handoffPage.data]);
        setTracking([...trackingPage.data]);
        setError(null);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Delivery tracking could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, [organizationId]);
  const byReference = new Map(tracking.map((item) => [item.handoffReference, item]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deliveries"
        description="Prepared pharmacy handoffs with privacy-minimized carrier tracking and proof status."
      />
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Pharmacy tracking shows the order, handoff, pickup location, delivery area, and status.
        Recipient identity, phone, full address, and verification code remain hidden.
      </div>
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={load} />
      ) : handoffs.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No delivery handoffs"
          description="Orders prepared with delivery as the handoff method will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {handoffs.map((handoff) => {
            const delivery = byReference.get(handoff.handoffReference);
            return (
              <div key={handoff.handoffId} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{handoff.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {handoff.handoffReference} · Prepared {formatDateTime(handoff.preparedAt)}
                  </p>
                  {delivery && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {delivery.pickupLocationName} → {delivery.deliveryArea.locality},{" "}
                      {delivery.deliveryArea.administrativeArea}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge
                    status={(delivery?.status ?? handoff.status).toLowerCase()}
                    size="sm"
                  />
                  {!delivery && handoff.status !== "CANCELLED" && (
                    <span className="text-[10px] text-muted-foreground">Awaiting dispatch</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
