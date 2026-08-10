"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { labRequestService } from "@/lib/services";
import { normalizeLabRequest, WithTimestamps } from "../normalize";
import type { LaboratoryRequest } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { Search, FlaskConical, ArrowRight, Clock } from "lucide-react";

export function ProviderLabRequests() {
  const { providerId } = useProviderContext();
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const labs = await labRequestService.list({ requestingProviderId: providerId });
      setLabRequests(labs.map(normalizeLabRequest));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load lab requests.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const sorted = [...labRequests].sort((a, b) => ((b as WithTimestamps<LaboratoryRequest>).createdAt ?? "").localeCompare((a as WithTimestamps<LaboratoryRequest>).createdAt ?? ""));
    const term = q.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((l) =>
      `${l.requestNumber} ${l.tests.join(" ")} ${l.patient ? fullName(l.patient) : ""}`.toLowerCase().includes(term)
    );
  }, [labRequests, q]);

  const pending = filtered.filter((l) => l.status === "pending_booking");
  const booked = filtered.filter((l) => ["booked", "sample_collected", "processing", "quality_review"].includes(l.status));
  const completed = filtered.filter((l) => l.status === "completed");

  function Row({ l }: { l: LaboratoryRequest }) {
    const hasResult = !!l.result;
    const isPending = l.status === "pending_booking";
    return (
      <Card className={`hover:shadow-soft-md transition-shadow ${isPending ? "border-amber-200 bg-amber-50/30" : ""}`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className={`rounded-xl p-2 shrink-0 ${hasResult ? "bg-violet-50" : isPending ? "bg-amber-50" : "bg-muted"}`}>
              <FlaskConical className={`h-5 w-5 ${hasResult ? "text-violet-600" : isPending ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{l.requestNumber}</p>
                <StatusBadge status={l.status} size="sm" />
                <Badge variant="outline" className="text-[10px] capitalize h-5">{l.priority}</Badge>
                {isPending && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting booking
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {l.patient ? fullName(l.patient) : "Patient"} · Ordered {formatDate((l as WithTimestamps<LaboratoryRequest>).createdAt)} · {relativeDay((l as WithTimestamps<LaboratoryRequest>).createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.tests.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] h-5">{t}</Badge>
                ))}
              </div>
              {l.clinicalIndication && (
                <p className="text-xs text-muted-foreground mt-2 border-t border-border/60 pt-2 leading-relaxed">
                  <span className="font-medium text-foreground">Indication:</span> {l.clinicalIndication}
                </p>
              )}
              {hasResult && l.result && (
                <div className="mt-2.5 rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-xs">
                  <p className="font-semibold text-violet-800 text-sm">{l.result.value} {l.result.unit}</p>
                  <p className="text-muted-foreground mt-0.5">Reference: {l.result.referenceRange} · {formatDate(l.result.resultDate)}</p>
                  {l.result.abnormalIndicator && l.result.abnormalIndicator !== "normal" && (
                    <Badge variant="outline" className="mt-1.5 border-rose-200 bg-rose-50 text-rose-700 capitalize text-[10px] h-5">{l.result.abnormalIndicator}</Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {hasResult ? (
                <Button size="sm" variant="outline" onClick={() => navigate("provider", "results", { id: l.result!.id })}>
                  Review result <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => navigate("provider", "patient", { id: l.patientId })}>
                  Open patient <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Laboratory requests" description="Tests you have ordered for your patients." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Laboratory requests"
        description="Tests you have ordered for your patients."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search request, test, patient…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <Tabs defaultValue="all">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="booked">In progress ({booked.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-3">
          {filtered.length === 0 ? <EmptyState icon={FlaskConical} title="No lab requests" description="Order lab tests from within an encounter." compact /> : filtered.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="pending" className="space-y-3">
          {pending.length === 0 ? <EmptyState icon={FlaskConical} title="No pending requests" description="All your tests have been booked." compact /> : pending.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="booked" className="space-y-3">
          {booked.length === 0 ? <EmptyState icon={FlaskConical} title="No tests in progress" description="Booked tests will appear here while being processed." compact /> : booked.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="completed" className="space-y-3">
          {completed.length === 0 ? <EmptyState icon={FlaskConical} title="No completed tests" description="Completed tests with results will appear here." compact /> : completed.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
