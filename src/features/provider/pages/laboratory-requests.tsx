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
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { Search, FlaskConical, ArrowRight } from "lucide-react";

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
    return (
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="rounded-lg bg-muted p-2 shrink-0">
              <FlaskConical className="h-5 w-5 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{l.requestNumber}</p>
                <StatusBadge status={l.status} />
                <Badge variant="outline" className="text-[10px] capitalize">{l.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {l.patient ? fullName(l.patient) : "Patient"} · Ordered {formatDate((l as WithTimestamps<LaboratoryRequest>).createdAt)} · {relativeDay((l as WithTimestamps<LaboratoryRequest>).createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {l.tests.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
              {l.clinicalIndication && (
                <p className="text-xs text-muted-foreground mt-2 border-t pt-2">Indication: {l.clinicalIndication}</p>
              )}
              {hasResult && l.result && (
                <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/50 p-2 text-xs">
                  <p className="font-medium text-violet-800">Result: {l.result.value} {l.result.unit}</p>
                  <p className="text-muted-foreground">Reference: {l.result.referenceRange} · {formatDate(l.result.resultDate)}</p>
                  {l.result.abnormalIndicator && l.result.abnormalIndicator !== "normal" && (
                    <Badge variant="outline" className="mt-1 border-rose-200 text-rose-700 capitalize text-[10px]">{l.result.abnormalIndicator}</Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
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

  if (loading) return <LoadingState label="Loading lab requests…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Laboratory requests"
        description="Tests you have ordered for your patients."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search request, test, patient…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="booked">In progress ({booked.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {filtered.length === 0 ? <EmptyState icon={FlaskConical} title="No lab requests" description="Order lab tests from within an encounter." /> : filtered.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="pending" className="space-y-3">
          {pending.length === 0 ? <EmptyState icon={FlaskConical} title="No pending requests" description="All your tests have been booked." /> : pending.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="booked" className="space-y-3">
          {booked.length === 0 ? <EmptyState icon={FlaskConical} title="No tests in progress" description="Booked tests will appear here while being processed." /> : booked.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
        <TabsContent value="completed" className="space-y-3">
          {completed.length === 0 ? <EmptyState icon={FlaskConical} title="No completed tests" description="Completed tests with results will appear here." /> : completed.map((l) => <Row key={l.id} l={l} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
