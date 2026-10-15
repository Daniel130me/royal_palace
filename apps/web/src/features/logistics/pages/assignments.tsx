"use client";

import { Package, PackageCheck, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";

import { CompactListItem } from "@/components/healthcare/compact-list";
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
import { navigate, useNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { formatAddress, formatDateTime, statusForBadge } from "../delivery-helpers";
import type { LogisticsDelivery } from "../logistics-types";
import { useLogisticsContext } from "../use-logistics-context";

type Filter = "available" | "active" | "completed";

export function LogisticsAssignments() {
  const { view } = useNav();
  const {
    active,
    available,
    completed,
    deliveries,
    error,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    refresh,
  } = useLogisticsContext();
  const filter: Filter = ["available", "active", "completed"].includes(view.params.tab ?? "")
    ? (view.params.tab as Filter)
    : "available";
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const base = filter === "available" ? available : filter === "active" ? active : completed;
    const query = search.trim().toLowerCase();
    return base
      .filter((delivery) => {
        if (!query) return true;
        return [
          delivery.deliveryNumber,
          delivery.orderNumber,
          delivery.pickupLocationName,
          formatAddress(delivery.deliveryAddress),
          delivery.recipientName,
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [active, available, completed, filter, search]);

  if (loading && deliveries.length === 0 && error === null) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={6} />
      </div>
    );
  }
  if (error !== null) return <ErrorState message={error} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assignments"
        description="Bounded, organization-scoped pickup and delivery work."
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search assignments"
          placeholder="Search delivery, order, location, or recipient…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={[
          { value: "available" as Filter, label: "Available", badge: available.length },
          { value: "active" as Filter, label: "Active", badge: active.length },
          { value: "completed" as Filter, label: "Done", badge: completed.length },
        ]}
        value={filter}
        onChange={(value) => navigate("logistics", "assignments", { tab: value })}
        size="sm"
      />
      {sorted.length === 0 ? (
        <EmptyState
          icon={filter === "available" ? Package : filter === "active" ? Truck : PackageCheck}
          title={`No ${filter} assignments`}
          description={
            search
              ? "No loaded delivery matches your search."
              : "Deliveries in this stage will appear here."
          }
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {sorted.map((delivery) => (
            <AssignmentRow key={delivery.id} delivery={delivery} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more assignments"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ delivery }: { delivery: LogisticsDelivery }) {
  const isAvailable = delivery.status === "ASSIGNED";
  const isDelivered = delivery.status === "DELIVERED";
  const tone = isAvailable
    ? "bg-amber-50 ring-amber-100 text-amber-600"
    : isDelivered
      ? "bg-emerald-50 ring-emerald-100 text-emerald-600"
      : "bg-sky-50 ring-sky-100 text-sky-600";
  return (
    <CompactListItem
      leading={
        <div className={cn("rounded-lg p-2 ring-1", tone)}>
          {isAvailable ? (
            <Package className="h-4 w-4" />
          ) : isDelivered ? (
            <PackageCheck className="h-4 w-4" />
          ) : (
            <Truck className="h-4 w-4" />
          )}
        </div>
      }
      title={delivery.deliveryNumber}
      subtitle={`${delivery.recipientName} · ${delivery.pickupLocationName} → ${delivery.deliveryAddress.locality}, ${delivery.deliveryAddress.countryCode} · ${formatDateTime(delivery.updatedAt)}`}
      trailing={<StatusBadge status={statusForBadge(delivery.status)} size="sm" />}
      onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
      chevron
    />
  );
}
