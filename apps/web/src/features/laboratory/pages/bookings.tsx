"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LaboratoryBookingResponse,
  LaboratoryQueueRequestResponse,
} from "@royal-palace/contracts";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  FlaskConical,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { ExpandableCard } from "@/components/healthcare/compact-list";
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
import { productionLaboratoryService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useLabContext } from "../use-lab-context";

type TabKey = "scheduled" | "processing" | "ready" | "completed";
type QueueItem = { booking: LaboratoryBookingResponse; request: LaboratoryQueueRequestResponse };

const WORKFLOW_STEPS = [
  { key: "CONFIRMED", label: "Booked" },
  { key: "SAMPLE_COLLECTION_PENDING", label: "Collection" },
  { key: "SAMPLE_COLLECTED", label: "Sample" },
  { key: "PROCESSING", label: "Processing" },
  { key: "RESULT_READY", label: "Result" },
] as const;

function queueItems(requests: readonly LaboratoryQueueRequestResponse[]): QueueItem[] {
  return requests.flatMap((request) => request.bookings.map((booking) => ({ booking, request })));
}

export function LabBookings() {
  const { labId } = useLabContext();
  const [requests, setRequests] = useState<readonly LaboratoryQueueRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [tab, setTab] = useState<TabKey>("scheduled");
  const [query, setQuery] = useState("");
  const [progressing, setProgressing] = useState<string | null>(null);

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
          cause instanceof Error ? cause.message : "Laboratory bookings could not be loaded.",
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
    const items = queueItems(requests).filter(({ request }) => {
      if (!query.trim()) return true;
      return `${request.requestNumber} ${request.service.name} ${request.patient.displayName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });
    return {
      scheduled: items.filter(
        ({ booking }) =>
          booking.status === "CONFIRMED" || booking.status === "SAMPLE_COLLECTION_PENDING",
      ),
      processing: items.filter(
        ({ booking }) => booking.status === "SAMPLE_COLLECTED" || booking.status === "PROCESSING",
      ),
      ready: items.filter(({ booking }) => booking.status === "RESULT_READY"),
      completed: items.filter(
        ({ booking }) => booking.status === "COMPLETED" || booking.status === "CANCELLED",
      ),
    };
  }, [query, requests]);

  async function advance(item: QueueItem) {
    if (!labId) return;
    const next =
      item.booking.status === "CONFIRMED"
        ? {
            reasonCode: "collection_arranged" as const,
            toStatus: "SAMPLE_COLLECTION_PENDING" as const,
          }
        : item.booking.status === "SAMPLE_COLLECTION_PENDING"
          ? { reasonCode: "sample_collected" as const, toStatus: "SAMPLE_COLLECTED" as const }
          : item.booking.status === "SAMPLE_COLLECTED"
            ? { reasonCode: "processing_started" as const, toStatus: "PROCESSING" as const }
            : null;
    if (!next) return;
    setProgressing(item.booking.id);
    try {
      await productionLaboratoryService.laboratory.transition(labId, item.booking.id, {
        ...next,
        expectedVersion: item.booking.version,
      });
      toast.success(`Booking updated to ${next.toStatus.toLowerCase().replaceAll("_", " ")}.`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The booking could not be updated.");
      await load();
    } finally {
      setProgressing(null);
    }
  }

  if (loading)
    return (
      <div className="space-y-5">
        <PageHeader title="Bookings" description="Sample collections and tests in progress." />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={load} />;

  const visible = groups[tab];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        description="Sample collections and tests assigned to this laboratory."
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search booking, patient or test…"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <SegmentedControl
        options={[
          { value: "scheduled" as TabKey, label: "Scheduled", badge: groups.scheduled.length },
          { value: "processing" as TabKey, label: "Processing", badge: groups.processing.length },
          { value: "ready" as TabKey, label: "Ready", badge: groups.ready.length },
          { value: "completed" as TabKey, label: "Completed", badge: groups.completed.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No bookings"
          description="No bookings match this filter."
          compact
        />
      ) : (
        <div className="space-y-2">
          {visible.map((item) => {
            const stepIndex = WORKFLOW_STEPS.findIndex((step) => step.key === item.booking.status);
            const canAdvance = [
              "CONFIRMED",
              "SAMPLE_COLLECTION_PENDING",
              "SAMPLE_COLLECTED",
            ].includes(item.booking.status);
            return (
              <ExpandableCard
                key={item.booking.id}
                leading={
                  <div className="rounded-lg bg-sky-50 p-2">
                    <FlaskConical className="h-4 w-4 text-sky-600" />
                  </div>
                }
                title={`${item.booking.bookingNumber} · ${item.request.service.name}`}
                subtitle={`${item.request.patient.displayName} · ${item.booking.scheduledAt ? formatDate(item.booking.scheduledAt) : "Schedule pending"}`}
                trailing={<StatusBadge status={item.booking.status.toLowerCase()} size="sm" />}
              >
                <div className="space-y-3">
                  <ol className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {WORKFLOW_STEPS.map((step, index) => {
                      const done = index < stepIndex;
                      const current = index === stepIndex;
                      return (
                        <li key={step.key} className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : current
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-muted text-muted-foreground",
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Circle className="h-3 w-3" />
                            )}
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    {canAdvance && (
                      <Button
                        size="sm"
                        disabled={progressing === item.booking.id}
                        onClick={() => void advance(item)}
                      >
                        Advance workflow <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate("laboratory", "request", { id: item.booking.id })}
                    >
                      View request →
                    </Button>
                  </div>
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
      {hasNextPage && endCursor && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void load(endCursor)}>
            {loadingMore ? "Loading…" : "Load more bookings"}
          </Button>
        </div>
      )}
    </div>
  );
}
