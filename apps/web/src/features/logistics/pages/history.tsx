"use client";

import {
  Ban,
  CheckCircle2,
  History as HistoryIcon,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
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

import { formatDate, statusForBadge } from "../delivery-helpers";
import type { LogisticsDelivery, LogisticsDeliveryStatus } from "../logistics-types";
import { useLogisticsContext } from "../use-logistics-context";

type Filter = "DELIVERED" | "FAILED" | "RETURNED" | "CANCELLED";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "Delivered", value: "DELIVERED" },
  { label: "Failed", value: "FAILED" },
  { label: "Returned", value: "RETURNED" },
  { label: "Cancelled", value: "CANCELLED" },
];
const STATUS_ICON: Partial<
  Record<LogisticsDeliveryStatus, React.ComponentType<{ className?: string }>>
> = { DELIVERED: CheckCircle2, FAILED: XCircle, RETURNED: RotateCcw, CANCELLED: Ban };
const STATUS_TONE: Record<Filter, string> = {
  DELIVERED: "bg-emerald-50 ring-emerald-100 text-emerald-600",
  FAILED: "bg-rose-50 ring-rose-100 text-rose-600",
  RETURNED: "bg-amber-50 ring-amber-100 text-amber-600",
  CANCELLED: "bg-muted ring-border text-muted-foreground",
};

export function LogisticsHistory() {
  const { view } = useNav();
  const { completed, deliveries, error, hasMore, loading, loadingMore, loadMore, refresh } =
    useLogisticsContext();
  const requested = (view.params.tab ?? "delivered").toUpperCase();
  const filter: Filter = FILTERS.some((item) => item.value === requested)
    ? (requested as Filter)
    : "DELIVERED";
  const [search, setSearch] = useState("");
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ value }) => [
          value,
          completed.filter((delivery) => delivery.status === value).length,
        ]),
      ) as Record<Filter, number>,
    [completed],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return completed
      .filter((delivery) => delivery.status === filter)
      .filter(
        (delivery) =>
          !query ||
          [
            delivery.deliveryNumber,
            delivery.orderNumber,
            delivery.recipientName,
            delivery.deliveryAddress.locality,
          ].some((value) => value.toLowerCase().includes(query)),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [completed, filter, search]);

  if (loading && deliveries.length === 0 && error === null)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null) return <ErrorState message={error} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery history"
        description="Immutable terminal delivery outcomes for this logistics organization."
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search delivery history"
          placeholder="Search delivery, order, recipient, or locality…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={FILTERS.map((item) => ({
          value: item.value,
          label: item.label,
          badge: counts[item.value],
        }))}
        value={filter}
        onChange={(value) => navigate("logistics", "history", { tab: value.toLowerCase() })}
        size="sm"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No deliveries in this history"
          description={
            search
              ? "No loaded record matches your search."
              : "Terminal deliveries in this category will appear here."
          }
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {rows.map((delivery) => (
            <HistoryRow key={delivery.id} delivery={delivery} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load older deliveries"}
          </Button>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ delivery }: { delivery: LogisticsDelivery }) {
  const Icon = STATUS_ICON[delivery.status] ?? HistoryIcon;
  return (
    <CompactListItem
      leading={
        <div className={cn("rounded-lg p-2 ring-1", STATUS_TONE[delivery.status as Filter])}>
          <Icon className="h-4 w-4" />
        </div>
      }
      title={delivery.deliveryNumber}
      subtitle={`${delivery.orderNumber} · ${delivery.deliveryAddress.locality} · ${formatDate(delivery.updatedAt)}`}
      trailing={<StatusBadge status={statusForBadge(delivery.status)} size="sm" />}
      onClick={() => navigate("logistics", "delivery", { id: delivery.id })}
      chevron
    />
  );
}
