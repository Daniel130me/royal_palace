"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LaboratoryRequestResponse } from "@royal-palace/contracts";
import { ArrowRight, Clock, FlaskConical, Search } from "lucide-react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";

type Tab = "pending" | "booked" | "completed" | "all";

function currentBooking(request: LaboratoryRequestResponse) {
  return request.bookings.find((booking) => booking.status !== "CANCELLED") ?? request.bookings[0];
}

export function ProviderLabRequests() {
  const [requests, setRequests] = useState<readonly LaboratoryRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("pending");

  const load = useCallback(async (cursor?: string) => {
    if (cursor === undefined) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const response = await productionLaboratoryService.provider.list(undefined, cursor);
      setRequests((current) =>
        cursor === undefined ? response.data : [...current, ...response.data],
      );
      setEndCursor(response.pageInfo.endCursor);
      setHasNextPage(response.pageInfo.hasNextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory requests could not be loaded.");
    } finally {
      if (cursor === undefined) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(undefined);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const ordered = [...requests].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    if (!term) return ordered;
    return ordered.filter((request) =>
      `${request.requestNumber} ${request.service.name} ${request.service.code} ${request.patient.displayName}`
        .toLowerCase()
        .includes(term),
    );
  }, [query, requests]);

  const pending = filtered.filter(
    (request) => request.status === "ACTIVE" && !currentBooking(request),
  );
  const booked = filtered.filter(
    (request) => request.status === "ACTIVE" && currentBooking(request),
  );
  const completed = filtered.filter((request) => request.status === "COMPLETED");
  const visible =
    tab === "all" ? filtered : tab === "pending" ? pending : tab === "booked" ? booked : completed;

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Laboratory requests"
          description="Tests you have ordered for your patients."
        />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Laboratory requests"
        description="Controlled-service requests issued from your consultations."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search request, test, patient…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
      />

      <div className="sticky top-14 z-20 mb-2 bg-background/95 pb-3 backdrop-blur-md lg:top-16">
        <SegmentedControl
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            { value: "pending", label: "Pending", badge: pending.length },
            { value: "booked", label: "In progress", badge: booked.length },
            { value: "completed", label: "Completed", badge: completed.length },
            { value: "all", label: "All", badge: filtered.length },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={tab === "pending" ? "No pending requests" : "No matching laboratory requests"}
          description={
            tab === "pending"
              ? "Patients have booked all active requests, or no request has been issued yet."
              : "Try another filter or issue a request from a consultation."
          }
          compact
        />
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
          {visible.map((request) => {
            const booking = currentBooking(request);
            return (
              <CompactListItem
                key={request.id}
                leading={
                  <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
                    <FlaskConical className="h-4 w-4" />
                  </div>
                }
                title={`${request.requestNumber} · ${request.service.name}`}
                subtitle={`${request.patient.displayName} · ${formatDate(request.createdAt)}`}
                onClick={() => navigate("provider", "patient", { id: request.patient.id })}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge
                        status={(booking?.status ?? request.status).toLowerCase()}
                        size="sm"
                      />
                      {!booking && request.status === "ACTIVE" && (
                        <Badge
                          variant="outline"
                          className="h-5 border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                        >
                          <Clock className="mr-0.5 h-2.5 w-2.5" /> awaiting
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] capitalize text-muted-foreground">
                      {request.priority.toLowerCase()}
                    </span>
                  </div>
                }
                chevron
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{visible.length} request(s)</p>
        <div className="flex items-center gap-2">
          {hasNextPage && endCursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={loadingMore}
              onClick={() => void load(endCursor)}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
            New from encounter <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
