"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Package } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type AdminOrder = PrescriptionComponents["schemas"]["AdminPharmacyOrder"];

export function AdminPharmacyOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderNumberPrefix, setOrderNumberPrefix] = useState("");
  const [appliedPrefix, setAppliedPrefix] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void productionPrescriptionService.admin
      .orders({ limit: 50, orderNumberPrefix: appliedPrefix })
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
  }, [appliedPrefix]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = orderNumberPrefix.trim();
    setAppliedPrefix(value.length >= 2 ? value.toUpperCase() : undefined);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy orders"
        description="Privacy-minimized platform oversight. Patient identity, prescription content and medication lines are deliberately excluded."
      />
      <form className="flex max-w-xl gap-2" onSubmit={search}>
        <Input
          aria-label="Order number prefix"
          maxLength={64}
          onChange={(event) => setOrderNumberPrefix(event.target.value)}
          placeholder="Order number prefix"
          value={orderNumberPrefix}
        />
        <Button type="submit">Search</Button>
      </form>
      {loading ? (
        <SkeletonGrid count={5} />
      ) : error !== null ? (
        <EmptyState title="Could not load pharmacy orders" description={error} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No pharmacy orders"
          description="No orders match this view."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/40"
              onClick={() => navigate("admin", "pharmacy-order", { id: order.id })}
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {order.pharmacy.displayName} · {order.itemCount} item
                  {order.itemCount === 1 ? "" : "s"} ·{" "}
                  {formatMinorCurrency(order.totalMinor, order.currency)} ·{" "}
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
