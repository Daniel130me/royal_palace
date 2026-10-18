"use client";

import type {
  AdminDeliveryListItem,
  AdminDeliveryScope,
  AdminDeliverySummary,
} from "@royal-palace/contracts";
import { CheckCircle2, Clock, Package, Search, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { administrationService } from "@/lib/services";
import { cn } from "@/lib/utils";

const EXCEPTIONS = ["FAILED", "RETURNED", "CANCELLED"];
const EMPTY_SUMMARY: AdminDeliverySummary = { active: 0, all: 0, delivered: 0, exception: 0 };

export function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<AdminDeliveryListItem[]>([]);
  const [summary, setSummary] = useState<AdminDeliverySummary>(EMPTY_SUMMARY);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminDeliveryScope>("ALL");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void administrationService
      .deliveries({ limit: 25, ...(query ? { query } : {}), scope: filter })
      .then((page) => {
        setDeliveries([...page.data]);
        setSummary(page.summary);
        setNextCursor(page.pageInfo.endCursor);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Deliveries could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [filter, query]);
  useEffect(load, [load]);
  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await administrationService.deliveries({
        cursor: nextCursor,
        limit: 25,
        ...(query ? { query } : {}),
        scope: filter,
      });
      setDeliveries((current) => [...current, ...page.data]);
      setNextCursor(page.pageInfo.endCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Older deliveries could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

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
        <StatTile label="Total" value={summary.all} icon={Truck} />
        <StatTile label="Active" value={summary.active} icon={Package} tone="info" />
        <StatTile label="Delivered" value={summary.delivered} icon={CheckCircle2} tone="success" />
        <StatTile label="Exceptions" value={summary.exception} icon={Clock} tone="warning" />
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
          { value: "ALL" as AdminDeliveryScope, label: "All", badge: summary.all },
          { value: "ACTIVE" as AdminDeliveryScope, label: "Active", badge: summary.active },
          {
            value: "DELIVERED" as AdminDeliveryScope,
            label: "Delivered",
            badge: summary.delivered,
          },
          {
            value: "EXCEPTION" as AdminDeliveryScope,
            label: "Exceptions",
            badge: summary.exception,
          },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />
      {error !== null && <ErrorState message={error} onRetry={load} />}
      {deliveries.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No deliveries"
          description="No loaded delivery matches these filters."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {deliveries.map((delivery) => (
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
