"use client";

import type { LaboratoryResultResponse } from "@royal-palace/contracts";
import { AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LaboratoryResultCard } from "@/features/shared/laboratory-result-card";
import { navigate, useNav } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";

type Tab = "action" | "all";

function actionableCritical(result: LaboratoryResultResponse) {
  return result.criticalResults.find(
    (critical) => critical.status === "OPEN" || critical.status === "ESCALATED",
  );
}

export function ProviderResults() {
  const { view } = useNav();
  const highlightId = view.params.id;
  const [results, setResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("action");

  const load = useCallback(async (cursor?: string) => {
    if (cursor === undefined) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const response = await productionLaboratoryService.provider.results(cursor);
      setResults((current) =>
        cursor === undefined ? response.data : [...current, ...response.data],
      );
      setEndCursor(response.pageInfo.endCursor);
      setHasNextPage(response.pageInfo.hasNextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory results could not be loaded.");
    } finally {
      if (cursor === undefined) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return results.filter((result) => {
      if (tab === "action" && actionableCritical(result) === undefined) return false;
      if (!term) return true;
      return `${result.service.name} ${result.patient.displayName} ${result.resultNumber} ${result.components
        .map((component) => `${component.name} ${component.value}`)
        .join(" ")}`
        .toLowerCase()
        .includes(term);
    });
  }, [query, results, tab]);

  const actionCount = useMemo(
    () => results.filter((result) => actionableCritical(result) !== undefined).length,
    [results],
  );

  async function acknowledge(result: LaboratoryResultResponse) {
    const critical = actionableCritical(result);
    if (!critical) return;
    setAcknowledgingId(critical.id);
    try {
      await productionLaboratoryService.provider.acknowledgeCriticalResult(
        critical.id,
        critical.version,
      );
      toast.success("Critical result acknowledged with an auditable timestamp.");
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "The critical result could not be acknowledged.",
      );
      await load();
    } finally {
      setAcknowledgingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader description="Published results for tests you ordered." title="Lab results" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div>
      <PageHeader
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search test, patient, value…"
              value={query}
            />
          </div>
        }
        description="Published results for tests you ordered."
        title="Lab results"
      />

      <div className="sticky top-14 z-20 mb-3 bg-background/95 pb-3 backdrop-blur-md lg:top-16">
        <SegmentedControl
          onChange={(value) => setTab(value as Tab)}
          options={[
            {
              value: "action",
              label: "Action required",
              icon: AlertTriangle,
              badge: actionCount || undefined,
            },
            { value: "all", label: "All results", icon: CheckCircle2, badge: results.length },
          ]}
          value={tab}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          description={
            tab === "action"
              ? "No critical results are awaiting your acknowledgement."
              : "Published laboratory results will appear here."
          }
          icon={tab === "action" ? CheckCircle2 : FlaskConical}
          title={tab === "action" ? "All caught up" : "No laboratory results"}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((result) => {
            const critical = actionableCritical(result);
            return (
              <LaboratoryResultCard
                actions={
                  <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                    {critical && (
                      <Button
                        disabled={acknowledgingId === critical.id}
                        onClick={() => void acknowledge(result)}
                        size="sm"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {acknowledgingId === critical.id
                          ? "Acknowledging…"
                          : "Acknowledge critical result"}
                      </Button>
                    )}
                    <Button
                      onClick={() => navigate("provider", "patient", { id: result.patient.id })}
                      size="sm"
                      variant="outline"
                    >
                      Open patient <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                }
                defaultOpen={result.id === highlightId || critical !== undefined}
                downloadAttachment={(resultId, attachmentId) =>
                  productionLaboratoryService.provider.resultAttachmentDownload(
                    resultId,
                    attachmentId,
                  )
                }
                key={result.id}
                result={result}
                showPatient
              />
            );
          })}
        </div>
      )}

      {hasNextPage && endCursor && (
        <div className="mt-4 flex justify-center">
          <Button disabled={loadingMore} onClick={() => void load(endCursor)} variant="outline">
            {loadingMore ? "Loading…" : "Load more results"}
          </Button>
        </div>
      )}
    </div>
  );
}
