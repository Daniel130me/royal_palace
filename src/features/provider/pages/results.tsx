"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate, useNav } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { labRequestService } from "@/lib/services";
import { normalizeLabRequest } from "../normalize";
import type { LaboratoryRequest, LaboratoryResult } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { resource } from "@/lib/api-client";
import { toast } from "sonner";
import { FlaskConical, ArrowRight, CheckCircle2, AlertTriangle, Search } from "lucide-react";

export function ProviderResults() {
  const { view } = useNav();
  const { providerId, profile } = useProviderContext();
  const highlightId = view.params.id;
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  const unreviewed = filtered.filter(({ result }) => !result.reviewer);
  const abnormal = filtered.filter(({ result }) => result.abnormalIndicator && result.abnormalIndicator !== "normal");

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

  function ResultCard({ request, result }: { request: LaboratoryRequest; result: LaboratoryResult }) {
    const abnormalFlag = result.abnormalIndicator && result.abnormalIndicator !== "normal";
    const reviewed = !!result.reviewer;
    const highlight = result.id === highlightId;
    return (
      <Card className={`hover:shadow-soft-md transition-shadow ${highlight ? "ring-2 ring-emerald-400" : ""} ${abnormalFlag ? "border-rose-200" : ""}`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className={`rounded-xl p-2 shrink-0 ${abnormalFlag ? "bg-rose-50" : "bg-muted"}`}>
              {abnormalFlag ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <FlaskConical className="h-5 w-5 text-violet-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{result.test}</p>
                {abnormalFlag ? (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 capitalize h-5 text-[10px]">{result.abnormalIndicator}</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 h-5 text-[10px]">normal</Badge>
                )}
                {reviewed && <Badge variant="outline" className="h-5 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> reviewed</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {request.patient ? fullName(request.patient) : "Patient"} · {request.requestNumber}
              </p>
              <p className="text-xs text-muted-foreground">Collected {formatDate(result.sampleCollectionDate)} · Reported {formatDate(result.resultDate)} · {relativeDay(result.resultDate)}</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Value</p>
                  <p className="font-semibold mt-0.5">{result.value} {result.unit}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reference range</p>
                  <p className="font-semibold mt-0.5">{result.referenceRange ?? "—"}</p>
                </div>
              </div>

              {result.interpretation && (
                <p className="text-xs text-muted-foreground mt-2.5 border-t border-border/60 pt-2 leading-relaxed">
                  <span className="font-medium text-foreground">Interpretation:</span> {result.interpretation}
                </p>
              )}
              {result.reviewer && (
                <p className="text-xs text-muted-foreground mt-1">Reviewed by: {result.reviewer}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {!reviewed ? (
                <Button size="sm" disabled={markingId === result.id} onClick={() => markReviewed(result.id, request.patient ? fullName(request.patient) : "patient")}>
                  {markingId === result.id ? "Marking…" : (<><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark reviewed</>)}
                </Button>
              ) : (
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 self-end">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledged
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate("provider", "patient", { id: request.patientId })}>
                Open patient <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
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

      <Tabs defaultValue="all">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
            <TabsTrigger value="unreviewed">
              Pending review ({unreviewed.length})
              {unreviewed.length > 0 && <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-200 bg-amber-50 text-amber-700 h-4.5">!</Badge>}
            </TabsTrigger>
            <TabsTrigger value="abnormal">
              Abnormal ({abnormal.length})
              {abnormal.length > 0 && <Badge variant="outline" className="ml-1.5 text-[10px] border-rose-200 bg-rose-50 text-rose-700 h-4.5">!</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-3">
          {filtered.length === 0 ? <EmptyState icon={FlaskConical} title="No results" description="Lab results will appear here once published." compact /> :
            filtered.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
        <TabsContent value="unreviewed" className="space-y-3">
          {unreviewed.length === 0 ? <EmptyState icon={CheckCircle2} title="All caught up" description="No results pending your review." compact /> :
            unreviewed.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
        <TabsContent value="abnormal" className="space-y-3">
          {abnormal.length === 0 ? <EmptyState icon={CheckCircle2} title="No abnormal results" description="All recent results are within normal range." compact /> :
            abnormal.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
