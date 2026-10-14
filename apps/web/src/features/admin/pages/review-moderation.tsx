"use client";

import type { LaboratoryComponents } from "@royal-palace/api-client";
import { Eye, EyeOff, ShieldCheck, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { productionLaboratoryService } from "@/lib/services";

type ModerationItem = LaboratoryComponents["schemas"]["LaboratoryReviewModerationItem"];
type ModerationStatus = ModerationItem["commentStatus"];
type ReasonCode = LaboratoryComponents["schemas"]["ReviewModerationReasonCode"];

const REASONS: readonly { label: string; value: ReasonCode }[] = [
  { label: "Abusive or harassing", value: "ABUSIVE_OR_HARASSING" },
  { label: "Contains clinical details", value: "CLINICAL_DETAILS" },
  { label: "Irrelevant to the service", value: "IRRELEVANT" },
  { label: "Contains personal data", value: "PERSONAL_DATA" },
  { label: "Spam or fraud", value: "SPAM_OR_FRAUD" },
];

export function AdminReviewModeration() {
  const [status, setStatus] = useState<ModerationStatus>("PENDING");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor === undefined) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const page = await productionLaboratoryService.admin.reviewComments(status, cursor, 25);
        setItems((current) => (cursor === undefined ? [...page.data] : [...current, ...page.data]));
        setEndCursor(page.pageInfo.endCursor);
        setHasNextPage(page.pageInfo.hasNextPage);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Review comments could not be loaded.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Review moderation"
        description="Moderate optional service comments without changing verified patient ratings."
      />
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
        Comments are user-entered content and may contain sensitive information. Use them only for
        moderation. Patient identity and clinical records are deliberately excluded from this view.
      </div>
      <SegmentedControl
        options={[
          { label: "Pending", value: "PENDING" as const },
          { label: "Published", value: "PUBLISHED" as const },
          { label: "Hidden", value: "HIDDEN" as const },
        ]}
        value={status}
        onChange={setStatus}
        size="sm"
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={`No ${status.toLowerCase()} comments`}
          description="There are no review comments in this moderation state."
          compact
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ModerationCard key={item.id} item={item} onDecided={() => load()} />
          ))}
          {hasNextPage && endCursor !== null ? (
            <Button disabled={loadingMore} onClick={() => void load(endCursor)} variant="outline">
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ModerationCard({
  item,
  onDecided,
}: {
  item: ModerationItem;
  onDecided: () => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState<ReasonCode | undefined>();
  const [submitting, setSubmitting] = useState<"PUBLISH" | "HIDE" | null>(null);

  async function decide(decision: "PUBLISH" | "HIDE") {
    if (decision === "HIDE" && reasonCode === undefined) return;
    setSubmitting(decision);
    try {
      await productionLaboratoryService.admin.moderateReviewComment(
        item.id,
        decision === "PUBLISH"
          ? { decision, expectedVersion: item.version }
          : { decision, expectedVersion: item.version, reasonCode: reasonCode as ReasonCode },
      );
      toast.success(decision === "PUBLISH" ? "Comment published." : "Comment hidden.");
      await onDecided();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The moderation decision failed.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.laboratory.displayName}</p>
          <p className="text-xs text-muted-foreground">
            Submitted {formatDateTime(item.submittedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 text-sm font-semibold"
            aria-label={`${item.score} stars`}
          >
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> {item.score}/5
          </span>
          <StatusBadge status={item.commentStatus.toLowerCase()} size="sm" />
        </div>
      </div>
      <blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
        {item.comment}
      </blockquote>
      {item.commentStatus === "HIDDEN" && item.moderationReasonCode !== null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Reason: {item.moderationReasonCode.toLowerCase().replaceAll("_", " ")}
        </p>
      ) : null}
      {item.commentStatus === "PENDING" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Select value={reasonCode} onValueChange={(value) => setReasonCode(value as ReasonCode)}>
            <SelectTrigger className="sm:w-56" aria-label="Reason for hiding comment">
              <SelectValue placeholder="Reason for hiding" />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>
                  {reason.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={submitting !== null || reasonCode === undefined}
            onClick={() => void decide("HIDE")}
            variant="outline"
          >
            <EyeOff className="h-4 w-4" /> {submitting === "HIDE" ? "Hiding…" : "Hide"}
          </Button>
          <Button disabled={submitting !== null} onClick={() => void decide("PUBLISH")}>
            <Eye className="h-4 w-4" /> {submitting === "PUBLISH" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
