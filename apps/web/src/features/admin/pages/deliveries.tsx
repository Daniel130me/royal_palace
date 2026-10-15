"use client";

import type { LogisticsComponents } from "@royal-palace/api-client";
import { CheckCircle2, Clock, Package, Search, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionLogisticsService } from "@/lib/services";
import { cn } from "@/lib/utils";

type Delivery = LogisticsComponents["schemas"]["AdminDelivery"];
type StatusFilter = "all" | "active" | "delivered" | "exception";
const ACTIVE = [
  "ASSIGNED",
  "ACCEPTED",
  "HEADING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKUP_VERIFIED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
];
const EXCEPTIONS = ["FAILED", "RETURNED", "CANCELLED"];

export function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void productionLogisticsService.admin
      .list({ limit: 50 })
      .then((page) => {
        setDeliveries([...page.data]);
        setNextCursor(page.nextCursor);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Deliveries could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await productionLogisticsService.admin.list({ cursor: nextCursor, limit: 50 });
      setDeliveries((current) => [...current, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Older deliveries could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: deliveries.length,
      active: deliveries.filter((delivery) => ACTIVE.includes(delivery.status)).length,
      delivered: deliveries.filter((delivery) => delivery.status === "DELIVERED").length,
      exception: deliveries.filter((delivery) => EXCEPTIONS.includes(delivery.status)).length,
    }),
    [deliveries],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deliveries
      .filter(
        (delivery) =>
          filter === "all" ||
          (filter === "active" && ACTIVE.includes(delivery.status)) ||
          (filter === "delivered" && delivery.status === "DELIVERED") ||
          (filter === "exception" && EXCEPTIONS.includes(delivery.status)),
      )
      .filter(
        (delivery) =>
          !query ||
          [
            delivery.deliveryNumber,
            delivery.orderNumber,
            delivery.handoffReference,
            delivery.logisticsOrganizationId,
            delivery.pharmacyOrganizationId,
            delivery.deliveryArea.locality,
          ].some((value) => value.toLowerCase().includes(query)),
      );
  }, [deliveries, filter, search]);

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null && deliveries.length === 0)
    return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deliveries"
        description="Privacy-minimized platform delivery oversight."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Deliveries" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Loaded" value={counts.all} icon={Truck} />
        <StatTile label="Active" value={counts.active} icon={Package} tone="info" />
        <StatTile label="Delivered" value={counts.delivered} icon={CheckCircle2} tone="success" />
        <StatTile label="Exceptions" value={counts.exception} icon={Clock} tone="warning" />
      </div>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Admin oversight intentionally excludes recipient identity, phone, full address, verification
        code, and patient payment details.
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search delivery oversight"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Delivery, order, handoff, organization, or locality…"
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "active" as StatusFilter, label: "Active", badge: counts.active },
          { value: "delivered" as StatusFilter, label: "Delivered", badge: counts.delivered },
          { value: "exception" as StatusFilter, label: "Exceptions", badge: counts.exception },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />
      {error !== null && <ErrorState message={error} onRetry={load} />}
      {visible.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No deliveries"
          description="No loaded delivery matches these filters."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {visible.map((delivery) => (
            <CompactListItem
              key={delivery.id}
              leading={
                <div
                  className={cn(
                    "rounded-lg p-2 ring-1",
                    delivery.status === "DELIVERED"
                      ? "bg-emerald-50 ring-emerald-100"
                      : EXCEPTIONS.includes(delivery.status)
                        ? "bg-rose-50 ring-rose-100"
                        : "bg-sky-50 ring-sky-100",
                  )}
                >
                  {delivery.status === "DELIVERED" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Truck
                      className={cn(
                        "h-4 w-4",
                        EXCEPTIONS.includes(delivery.status) ? "text-rose-600" : "text-sky-600",
                      )}
                    />
                  )}
                </div>
              }
              title={`${delivery.deliveryNumber} · ${delivery.orderNumber}`}
              subtitle={`${delivery.deliveryArea.locality}, ${delivery.deliveryArea.administrativeArea}, ${delivery.deliveryArea.countryCode} · Logistics org ${delivery.logisticsOrganizationId} · ${delivery.courierAssigned ? "Courier assigned" : "Unassigned"} · ${formatDate(delivery.updatedAt)}`}
              trailing={<StatusBadge status={delivery.status.toLowerCase()} size="sm" />}
            />
          ))}
        </div>
      )}
      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more deliveries"}
          </Button>
        </div>
      )}
    </div>
  );
}
