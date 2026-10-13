"use client";

import type { LaboratoryResultFlag, LaboratoryResultResponse } from "@royal-palace/contracts";
import { FileCheck2, FileText, Search } from "lucide-react";
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
import { navigate } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

type TabKey = "all" | "critical" | "abnormal" | "normal";

function matchesTab(flag: LaboratoryResultFlag, tab: TabKey) {
  if (tab === "all") return true;
  if (tab === "critical") return flag === "CRITICAL";
  if (tab === "normal") return flag === "NORMAL";
  return flag !== "NORMAL" && flag !== "CRITICAL";
}

export function LabResults() {
  const { labId } = useLabContext();
  const [results, setResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (cursor?: string) => {
      if (!labId) return;
      if (cursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await productionLaboratoryService.laboratory.results(
          labId,
          undefined,
          cursor,
        );
        setResults((current) =>
          cursor === undefined ? response.data : [...current, ...response.data],
        );
        setEndCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Laboratory results could not be loaded.",
        );
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

  const counts = useMemo(
    () => ({
      abnormal: results.filter(
        (result) => result.summaryFlag !== "NORMAL" && result.summaryFlag !== "CRITICAL",
      ).length,
      critical: results.filter((result) => result.summaryFlag === "CRITICAL").length,
      normal: results.filter((result) => result.summaryFlag === "NORMAL").length,
    }),
    [results],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return results.filter((result) => {
      if (!matchesTab(result.summaryFlag, tab)) return false;
      if (!term) return true;
      return `${result.service.name} ${result.resultNumber} ${result.patient.displayName} ${result.components
        .map((component) => `${component.name} ${component.value}`)
        .join(" ")}`
        .toLowerCase()
        .includes(term);
    });
  }, [query, results, tab]);

  async function publish(result: LaboratoryResultResponse) {
    if (!labId) return;
    setPublishingId(result.id);
    try {
      const reviewed =
        result.status === "DRAFT"
          ? await productionLaboratoryService.laboratory.transitionResultReview(labId, result.id, {
              expectedVersion: result.version,
              reasonCode: "submitted_for_review",
              toStatus: "IN_REVIEW",
            })
          : result;
      await productionLaboratoryService.laboratory.publishResult(
        labId,
        result.id,
        reviewed.version,
      );
      toast.success("Result published securely to the patient and ordering practitioner.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The result could not be published.");
      await load();
    } finally {
      setPublishingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 animate-pulse rounded-lg bg-muted/40" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Results"
        description="Draft, review and publish laboratory results through the controlled workflow."
        actions={
          <Button
            className="hidden lg:inline-flex"
            onClick={() => navigate("laboratory", "bookings")}
            size="sm"
            variant="outline"
          >
            <FileCheck2 className="h-4 w-4" /> Enter new
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by test, patient or result number…"
          value={query}
        />
      </div>

      <SegmentedControl
        onChange={setTab}
        options={[
          { value: "all" as TabKey, label: "All", badge: results.length },
          { value: "critical" as TabKey, label: "Critical", badge: counts.critical },
          { value: "abnormal" as TabKey, label: "Abnormal", badge: counts.abnormal },
          { value: "normal" as TabKey, label: "Normal", badge: counts.normal },
        ]}
        size="sm"
        value={tab}
      />

      {visible.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => navigate("laboratory", "bookings")} size="sm">
              Go to bookings
            </Button>
          }
          compact
          description="Results entered from a processing booking will appear here."
          icon={FileText}
          title="No results"
        />
      ) : (
        <div className="space-y-2">
          {visible.map((result) => {
            const attachmentsReady = result.attachments.every(
              (attachment) => attachment.status === "CLEAN",
            );
            const publishable =
              (result.status === "DRAFT" || result.status === "IN_REVIEW") && attachmentsReady;
            return (
              <LaboratoryResultCard
                actions={
                  result.status === "DRAFT" || result.status === "IN_REVIEW" ? (
                    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <p className="text-xs text-muted-foreground">
                        {attachmentsReady
                          ? "Ready for controlled publication."
                          : "Attachment scanning must finish before publication."}
                      </p>
                      <Button
                        disabled={!publishable || publishingId === result.id}
                        onClick={() => void publish(result)}
                        size="sm"
                      >
                        {publishingId === result.id ? "Publishing…" : "Publish"}
                      </Button>
                    </div>
                  ) : undefined
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
            );
          })}
        </div>
      )}

      {hasNextPage && endCursor && (
        <div className="flex justify-center">
          <Button disabled={loadingMore} onClick={() => void load(endCursor)} variant="outline">
            {loadingMore ? "Loading…" : "Load more results"}
          </Button>
        </div>
      )}
    </div>
  );
}
