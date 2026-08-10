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
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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
      // Mark as reviewed by setting the reviewer field to the provider's name.
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
      <Card className={`hover:shadow-sm transition-shadow ${highlight ? "ring-2 ring-emerald-400" : ""} ${abnormalFlag ? "border-rose-200" : ""}`}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className={`rounded-lg p-2 shrink-0 ${abnormalFlag ? "bg-rose-50" : "bg-muted"}`}>
              {abnormalFlag ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <FlaskConical className="h-5 w-5 text-violet-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{result.test}</p>
                {abnormalFlag ? (
                  <Badge variant="outline" className="border-rose-200 text-rose-700 capitalize text-[10px]">{result.abnormalIndicator}</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700 text-[10px]">normal</Badge>
                )}
                {reviewed && <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> reviewed</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {request.patient ? fullName(request.patient) : "Patient"} · {request.requestNumber}
              </p>
              <p className="text-xs text-muted-foreground">Collected {formatDate(result.sampleCollectionDate)} · Reported {formatDate(result.resultDate)} · {relativeDay(result.resultDate)}</p>

              <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-md border p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Value</p>
                  <p className="font-medium">{result.value} {result.unit}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Reference range</p>
                  <p className="font-medium">{result.referenceRange ?? "—"}</p>
                </div>
              </div>

              {result.interpretation && (
                <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
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
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 self-end">
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

  if (loading) return <LoadingState label="Loading lab results…" />;
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
        <TabsList className="mb-4">
          <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          <TabsTrigger value="unreviewed">
            Pending review ({unreviewed.length})
            {unreviewed.length > 0 && <Badge variant="outline" className="ml-1 text-[10px] border-amber-200 text-amber-700">!</Badge>}
          </TabsTrigger>
          <TabsTrigger value="abnormal">
            Abnormal ({abnormal.length})
            {abnormal.length > 0 && <Badge variant="outline" className="ml-1 text-[10px] border-rose-200 text-rose-700">!</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {filtered.length === 0 ? <EmptyState icon={FlaskConical} title="No results" description="Lab results will appear here once published." /> :
            filtered.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
        <TabsContent value="unreviewed" className="space-y-3">
          {unreviewed.length === 0 ? <EmptyState icon={CheckCircle2} title="All caught up" description="No results pending your review." /> :
            unreviewed.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
        <TabsContent value="abnormal" className="space-y-3">
          {abnormal.length === 0 ? <EmptyState icon={CheckCircle2} title="No abnormal results" description="All recent results are within normal range." /> :
            abnormal.map(({ request, result }) => <ResultCard key={result.id} request={request} result={result} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
