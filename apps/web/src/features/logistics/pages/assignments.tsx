"use client";

import { useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import type { Delivery } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDateTime } from "../delivery-helpers";
import {
  Package, MapPin, User, Search, ArrowRight, PackageCheck,
  Truck, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "available" | "active" | "completed";

export function LogisticsAssignments() {
  const { view } = useNav();
  const { deliveries, loading, error, refresh, available, active, completed } = useLogisticsContext();
  const filter: Filter = (view.params.tab as Filter) ?? "available";
  const [search, setSearch] = useState("");

  const list = useMemo<Delivery[]>(() => {
    const base = filter === "available" ? available : filter === "active" ? active : completed;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (d) =>
        d.deliveryNumber.toLowerCase().includes(q) ||
        d.deliveryLocation.toLowerCase().includes(q) ||
        d.pickupLocation.toLowerCase().includes(q) ||
        d.recipientName.toLowerCase().includes(q)
    );
  }, [filter, search, available, active, completed]);

  const sorted = useMemo(() => {
    const copy = [...list];
    if (filter === "available") {
      copy.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    } else if (filter === "active") {
      copy.sort((a, b) => (a.status).localeCompare(b.status));
    } else {
      copy.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }
    return copy;
  }, [list, filter]);

  if (loading && deliveries.length === 0 && !error) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={6} />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assignments"
        description="Pickups and deliveries allocated to you."
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by delivery no., location, recipient…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={[
          { value: "available" as Filter, label: "Available", badge: available.length },
          { value: "active" as Filter, label: "Active", badge: active.length },
          { value: "completed" as Filter, label: "Done", badge: completed.length },
        ]}
        value={filter}
        onChange={(v) => navigate("logistics", "assignments", { tab: v })}
        size="sm"
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={
            filter === "available"
              ? Package
              : filter === "active"
              ? Truck
              : PackageCheck
          }
          title={
            filter === "available"
              ? "No available assignments"
              : filter === "active"
              ? "No active deliveries"
              : "No completed deliveries yet"
          }
          description={
            search.trim()
              ? "No deliveries match your search. Try a different term."
              : filter === "available"
              ? "New pharmacy orders awaiting a courier will appear here."
              : filter === "active"
              ? "Accept an available assignment to begin a delivery."
              : "Completed, failed, and returned deliveries will appear here."
          }
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {sorted.map((d) => (
            <AssignmentRow key={d.id} delivery={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ delivery }: { delivery: Delivery }) {
  const isAvailable = delivery.status === "assigned";
  const isDelivered = delivery.status === "delivered";

  const leadingBg = isAvailable
    ? "bg-amber-50 ring-amber-100"
    : isDelivered
    ? "bg-emerald-50 ring-emerald-100"
    : "bg-sky-50 ring-sky-100";

  const leadingIconColor = isAvailable ? "text-amber-600" : isDelivered ? "text-emerald-600" : "text-sky-600";

  return (
    <CompactListItem
      leading={
        <div className={cn("rounded-lg p-2 ring-1", leadingBg)}>
          {isAvailable ? <Package className={cn("h-4 w-4", leadingIconColor)} /> : isDelivered ? <PackageCheck className={cn("h-4 w-4", leadingIconColor)} /> : <Truck className={cn("h-4 w-4", leadingIconColor)} />}
        </div>
      }
      title={delivery.deliveryNumber}
      subtitle={`${delivery.pickupLocation} → ${delivery.deliveryLocation} · ${delivery.recipientName}`}
      trailing={
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(delivery.payout)}</span>
          <StatusBadge status={delivery.status} size="sm" />
        </div>
      }
      onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
      chevron
    />
  );
}
