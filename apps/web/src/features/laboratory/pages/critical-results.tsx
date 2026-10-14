"use client";

import type { LaboratoryResultResponse } from "@royal-palace/contracts";
import { AlertTriangle, ShieldCheck, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { LaboratoryResultCard } from "@/features/shared/laboratory-result-card";
import { formatDateTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

export function LabCriticalResults() {
  const { labId } = useLabContext();
  const [results, setResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      if (!labId) return;
      if (cursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await productionLaboratoryService.laboratory.results(
          labId,
          "PUBLISHED",
          cursor,
          25,
        );
        const critical = response.data.filter((result) => result.summaryFlag === "CRITICAL");
        setResults((current) => (cursor === undefined ? critical : [...current, ...critical]));
        setEndCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Critical results could not be loaded.");
      } finally {
        if (cursor === undefined) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [labId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <Button
            className="hidden lg:inline-flex"
            onClick={() => navigate("laboratory", "results")}
            size="sm"
            variant="outline"
          >
            View all results
          </Button>
        }
        description="Published critical results and their practitioner acknowledgement state."
        title="Critical results"
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="shrink-0 rounded-lg bg-amber-100 p-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Controlled escalation protocol</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
            Publication automatically creates the configured acknowledgement deadline and a
            privacy-safe practitioner alert. Overdue records are escalated by the worker; laboratory
            staff cannot fabricate a notification event from this screen.
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          compact
          description="Published results flagged as critical will appear here for follow-up."
          icon={ShieldCheck}
          title="No critical results"
        />
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <LaboratoryResultCard
              actions={
                <div className="space-y-2 border-t border-border/60 pt-3">
                  {result.criticalResults.map((critical) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 p-2.5 text-xs"
                      key={critical.id}
                    >
                      <div>
                        <p className="font-medium">Practitioner acknowledgement</p>
                        <p className="text-muted-foreground">
                          Due {formatDateTime(critical.acknowledgementDueAt)}
                        </p>
                      </div>
                      <StatusBadge size="sm" status={critical.status.toLowerCase()} />
                    </div>
                  ))}
                  <Button
                    onClick={() => navigate("laboratory", "results")}
                    size="sm"
                    variant="outline"
                  >
                    <Stethoscope className="h-3.5 w-3.5" /> View result
                  </Button>
                </div>
              }
              downloadAttachment={(resultId, attachmentId) =>
                productionLaboratoryService.laboratory.resultAttachmentDownload(
                  labId!,
                  resultId,
                  attachmentId,
                )
              }
              key={result.id}
              result={result}
              showPatient
            />
          ))}
        </div>
      )}

      {hasNextPage && endCursor && (
        <div className="flex justify-center">
          <Button disabled={loadingMore} onClick={() => void load(endCursor)} variant="outline">
            {loadingMore ? "Loading…" : "Load more critical results"}
          </Button>
        </div>
      )}
    </div>
  );
}
