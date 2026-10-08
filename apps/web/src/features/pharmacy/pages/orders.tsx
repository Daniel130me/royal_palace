"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Order = PrescriptionComponents["schemas"]["PharmacyOrder"];

export function PharmacyOrders() {
  const organizationId = useNav().session?.profileId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    let active = true;
    productionPrescriptionService.pharmacy
      .orders(organizationId)
      .then((page) => active && setOrders([...page.data]))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Orders could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Paid and pending orders accepted from pharmacy quotes."
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Could not load orders" description={error} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders"
          description="Orders appear after a patient accepts a quote."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/40"
              onClick={() => navigate("pharmacy", "order", { id: order.id })}
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMinorCurrency(order.quote.totalMinor, order.quote.currency)} ·{" "}
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <StatusBadge status={order.status.toLowerCase()} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
