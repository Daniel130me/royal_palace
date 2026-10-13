"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LaboratoryQueueRequestResponse } from "@royal-palace/contracts";
import { FlaskConical, Search } from "lucide-react";

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
import { navigate } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

type TabKey = "incoming" | "active" | "completed" | "all";

function visibleBooking(request: LaboratoryQueueRequestResponse) {
  return request.bookings.find((booking) => booking.status !== "CANCELLED") ?? request.bookings[0];
}

export function LabRequests() {
  const { labId } = useLabContext();
  const [requests, setRequests] = useState<readonly LaboratoryQueueRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [tab, setTab] = useState<TabKey>("incoming");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (cursor?: string) => {
      if (!labId) return;
      if (cursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await productionLaboratoryService.laboratory.list(
          labId,
          undefined,
          cursor,
        );
        setRequests((current) =>
          cursor === undefined ? response.data : [...current, ...response.data],
        );
        setEndCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Laboratory requests could not be loaded.",
        );
      } finally {
        if (cursor === undefined) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [labId],
  );

  useEffect(() => {
    void load(undefined);
  }, [load]);

  const groups = useMemo(() => {
    const searched = requests.filter((request) => {
      if (!query.trim()) return true;
      return `${request.requestNumber} ${request.service.name} ${request.patient.displayName} ${request.practitioner.displayName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });
    return {
      all: searched,
      incoming: searched.filter((request) => {
        const booking = visibleBooking(request);
        return booking?.status === "CONFIRMED" || booking?.status === "SAMPLE_COLLECTION_PENDING";
      }),
      active: searched.filter((request) => {
        const status = visibleBooking(request)?.status;
        return (
          status === "SAMPLE_COLLECTED" || status === "PROCESSING" || status === "RESULT_READY"
        );
      }),
      completed: searched.filter((request) => {
        const status = visibleBooking(request)?.status;
        return status === "COMPLETED" || status === "CANCELLED";
      }),
    };
  }, [query, requests]);

  if (loading)
    return (
      <div className="space-y-5">
        <PageHeader title="Test requests" description="Bookings assigned to this laboratory." />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={load} />;

  const visible = groups[tab];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Test requests"
        description="Patient-approved requests booked with this laboratory."
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search request, test, patient or provider…"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <SegmentedControl
        options={[
          { value: "incoming" as TabKey, label: "Incoming", badge: groups.incoming.length },
          { value: "active" as TabKey, label: "Active", badge: groups.active.length },
          { value: "completed" as TabKey, label: "Completed", badge: groups.completed.length },
          { value: "all" as TabKey, label: "All", badge: groups.all.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No assigned requests"
          description="Requests appear only after a patient books this verified laboratory."
          compact
        />
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
          {visible.map((request) => {
            const booking = visibleBooking(request);
            if (!booking) return null;
            return (
              <CompactListItem
                key={request.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2">
                    <FlaskConical className="h-4 w-4 text-sky-600" />
                  </div>
                }
                title={`${request.requestNumber} · ${request.service.name}`}
                subtitle={`${request.patient.displayName} · ${request.practitioner.displayName}`}
                trailing={
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={request.priority.toLowerCase()} size="sm" />
                    <StatusBadge status={booking.status.toLowerCase()} size="sm" />
                  </div>
                }
                onClick={() => navigate("laboratory", "request", { id: booking.id })}
                chevron
              />
            );
          })}
        </div>
      )}
      {hasNextPage && endCursor && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void load(endCursor)}>
            {loadingMore ? "Loading…" : "Load more requests"}
          </Button>
        </div>
      )}
    </div>
  );
}
