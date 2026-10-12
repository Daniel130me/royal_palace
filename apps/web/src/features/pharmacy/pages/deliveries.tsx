"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Truck } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDateTime } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Delivery = PrescriptionComponents["schemas"]["PharmacyDelivery"];

export function PharmacyDeliveries() {
  const organizationId = useNav().session?.profileId;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    let active = true;
    void productionPrescriptionService.pharmacy
      .deliveries(organizationId)
      .then((page) => active && setDeliveries([...page.data]))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Deliveries could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deliveries"
        description="Delivery handoffs prepared by this pharmacy. Carrier assignment, tracking and proof of delivery will appear when the logistics integration is enabled."
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Could not load deliveries" description={error} />
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No delivery handoffs"
          description="Orders prepared with delivery as the handoff method will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {deliveries.map((delivery) => (
            <div key={delivery.handoffId} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{delivery.orderNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {delivery.handoffReference} · Prepared {formatDateTime(delivery.preparedAt)}
                </p>
              </div>
              <StatusBadge status={delivery.status.toLowerCase()} size="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
