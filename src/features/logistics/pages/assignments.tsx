"use client";

import { useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import type { Delivery } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDateTime } from "../delivery-helpers";
import {
  Package, MapPin, User, Search, ArrowRight, PackageCheck,
  Truck, CheckCircle2,
} from "lucide-react";

type Filter = "available" | "active" | "completed";

const ACTIVE_STATUSES = [
  "accepted",
  "heading_to_pickup",
  "arrived_at_pickup",
  "pickup_verified",
  "picked_up",
  "in_transit",
  "arrived_at_destination",
];
const COMPLETED_STATUSES = ["delivered", "failed", "returned", "cancelled"];

export function LogisticsAssignments() {
  const { view } = useNav();
  const { deliveries, loading, error, refresh, available, active, completed } = useLogisticsContext();
  // Filter state is derived from the URL `tab` param so deep links and the
  // browser back button stay in sync. No local mirror needed.
  const filter: Filter = (view.params.tab as Filter) ?? "available";
  const [search, setSearch] = useState("");

  const list = useMemo<Delivery[]>(() => {
    const base =
      filter === "available" ? available : filter === "active" ? active : completed;
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

  // Sort: available by createdAt asc (oldest first), active by status
  // progression, completed by delivered time desc.
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
    return <LoadingState label="Loading assignments…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }

  return (
    <div>
      <PageHeader
        title="My assignments"
        description="Deliveries allocated to your logistics account. Filter by stage or search by delivery number, location, or recipient."
      />

      <Tabs
        value={filter}
        onValueChange={(v) => {
          navigate("logistics", "assignments", { tab: v });
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="available" className="flex-1 sm:flex-initial">
              Available ({available.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="flex-1 sm:flex-initial">
              Active ({active.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 sm:flex-initial">
              Completed ({completed.length})
            </TabsTrigger>
          </TabsList>
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by number, location, recipient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

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
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((d) => (
              <AssignmentCard key={d.id} delivery={d} />
            ))}
          </div>
        )}
      </Tabs>
    </div>
  );
}

function AssignmentCard({ delivery }: { delivery: Delivery }) {
  const isAvailable = delivery.status === "assigned";
  const isCompleted = COMPLETED_STATUSES.includes(delivery.status);

  return (
    <Card
      className={`overflow-hidden transition-shadow hover:shadow-md ${
        isAvailable ? "border-amber-200" : isCompleted && delivery.status === "delivered" ? "border-emerald-200" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{delivery.deliveryNumber}</p>
              <StatusBadge status={delivery.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {delivery.packageType.replace(/_/g, " ")} package
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase">Payout</p>
            <p className="text-base font-bold text-emerald-700">{formatCurrency(delivery.payout)}</p>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="font-medium truncate">{delivery.pickupLocation}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Drop-off</p>
              <p className="font-medium truncate">{delivery.deliveryLocation}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Recipient</p>
              <p className="font-medium truncate">{delivery.recipientName}</p>
            </div>
          </div>
        </div>

        {(delivery.updatedAt || delivery.createdAt) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            {isCompleted ? "Last updated" : "Created"}{" "}
            {formatDateTime(delivery.updatedAt ?? delivery.createdAt)}
          </p>
        )}

        <Button
          variant={isAvailable ? "default" : "outline"}
          size="sm"
          className={`w-full mt-3 ${isAvailable ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
        >
          {isAvailable ? "View & Accept" : isCompleted ? "View summary" : "View & progress"}
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
