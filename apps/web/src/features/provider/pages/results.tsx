"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate, useNav } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { labRequestService } from "@/lib/services";
import { normalizeLabRequest } from "../normalize";
import type { LaboratoryRequest, LaboratoryResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { resource } from "@/lib/api-client";
import { toast } from "sonner";
import { FlaskConical, ArrowRight, CheckCircle2, AlertTriangle, Search } from "lucide-react";

type Tab = "pending" | "reviewed";

export function ProviderResults() {
  const { view } = useNav();
  const { providerId, profile } = useProviderContext();
  const highlightId = view.params.id;
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("pending");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const labs = await labRequestService.list({ requestingProviderId: providerId });
      setLabRequests(labs.map(normalizeLabRequest));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load results.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(
    () => labRequests.filter((l) => l.result).map((l) => ({ request: l, result: l.result! })),
    [labRequests]
  );

  const filtered = useMemo(() => {
    const sorted = [...results].sort((a, b) => (b.result.resultDate ?? "").localeCompare(a.result.resultDate ?? ""));
    const term = q.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter(({ request, result }) =>
      `${result.test} ${result.value} ${result.unit} ${request.patient ? fullName(request.patient) : ""} ${request.requestNumber}`.toLowerCase().includes(term)
    );
  }, [results, q]);

  const pending = filtered.filter(({ result }) => !result.reviewer);
  const reviewed = filtered.filter(({ result }) => result.reviewer);

  const current = tab === "pending" ? pending : reviewed;

  async function markReviewed(resultId: string, patientName: string) {
    setMarkingId(resultId);
    try {
      const reviewerName = profile ? `${profile.title} ${profile.lastName} (reviewed)` : "Provider (reviewed)";
      await resource.update<LaboratoryResult>("laboratoryResult", resultId, {
        reviewer: reviewerName,
      });
      toast.success("Marked as reviewed.", { description: `${patientName}'s result has been acknowledged.` });
      await load();
    } catch (e) {
      toast.error("Could not mark reviewed: " + (e as Error).message);
    } finally {
      setMarkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Lab results" description="Results for the tests you have ordered." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Lab results"
        description="Results for the tests you have ordered."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search test, patient, value…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-3">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "pending", label: "Pending review", icon: AlertTriangle, badge: pending.length || undefined },
            { value: "reviewed", label: "Reviewed", icon: CheckCircle2, badge: reviewed.length || undefined },
          ]}
        />
      </div>

      {current.length === 0 ? (
        <EmptyState
          icon={tab === "pending" ? CheckCircle2 : FlaskConical}
          title={tab === "pending" ? "All caught up" : "No reviewed results"}
          description={
            tab === "pending"
              ? "No results pending your review."
              : "Reviewed results will appear here once acknowledged."
          }
          compact
        />
      ) : (
        <div className="space-y-2.5">
          {current.map(({ request, result }) => {
            const abnormalFlag = result.abnormalIndicator && result.abnormalIndicator !== "normal";
            const isReviewed = !!result.reviewer;
            const highlight = result.id === highlightId;
            return (
              <ExpandableCard
                key={result.id}
                className={highlight ? "ring-2 ring-emerald-400" : ""}
                title={result.test}
                subtitle={`${request.patient ? fullName(request.patient) : "Patient"} · ${request.requestNumber} · ${formatDate(result.resultDate)} · ${relativeDay(result.resultDate)}`}
                leading={
                  <div className={`rounded-xl p-2 ${abnormalFlag ? "bg-rose-50" : "bg-muted"}`}>
                    {abnormalFlag
                      ? <AlertTriangle className="h-4 w-4 text-rose-600" />
                      : <FlaskConical className="h-4 w-4 text-violet-600" />}
                  </div>
                }
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    {abnormalFlag ? (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 capitalize h-5 text-[10px]">{result.abnormalIndicator}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 h-5 text-[10px]">normal</Badge>
                    )}
                    {isReviewed && (
                      <Badge variant="outline" className="h-5 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> reviewed
                      </Badge>
                    )}
                  </div>
                }
                defaultOpen={highlight}
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Value</p>
                      <p className="font-semibold mt-0.5">{result.value} {result.unit}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reference</p>
                      <p className="font-semibold mt-0.5">{result.referenceRange ?? "—"}</p>
                    </div>
                  </div>

                  {result.interpretation && (
                    <p className="text-xs text-muted-foreground border-t border-border/60 pt-2 leading-relaxed">
                      <span className="font-medium text-foreground">Interpretation:</span> {result.interpretation}
                    </p>
                  )}

                  {result.reviewer && (
                    <p className="text-xs text-muted-foreground">Reviewed by: {result.reviewer}</p>
                  )}

                  <div className="flex gap-2">
                    {!isReviewed ? (
                      <Button size="sm" disabled={markingId === result.id} onClick={() => markReviewed(result.id, request.patient ? fullName(request.patient) : "patient")}>
                        {markingId === result.id ? "Marking…" : (<><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark reviewed</>)}
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledged
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate("provider", "patient", { id: request.patientId })}>
                      Open patient <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs text-muted-foreground">{current.length} result(s)</p>
      </div>
    </div>
  );
}
