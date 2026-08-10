"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService } from "@/lib/services";
import type { LaboratoryRequest } from "@/types";
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState, ErrorState } from "@/components/healthcare/states";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Search, ArrowRight } from "lucide-react";

type TabKey = "incoming" | "active" | "completed" | "all";

export function LabRequests() {
  const { labId, reload } = useLabContext();
  const [requests, setRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("incoming");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!labId) return;
    setLoading(true);
    labRequestService
      .list()
      .then(setRequests)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load requests."))
      .finally(() => setLoading(false));
  }, [labId]);

  const incoming = useMemo(
    () => requests.filter((r) => r.status === "pending_booking"),
    [requests]
  );
  const active = useMemo(
    () => requests.filter((r) => ["booked", "sample_collected", "processing", "quality_review"].includes(r.status)),
    [requests]
  );
  const completed = useMemo(
    () => requests.filter((r) => ["completed", "cancelled"].includes(r.status)),
    [requests]
  );

  const visible = useMemo(() => {
    const base = tab === "incoming" ? incoming : tab === "active" ? active : tab === "completed" ? completed : requests;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((r) =>
      r.requestNumber.toLowerCase().includes(q) ||
      r.tests.join(" ").toLowerCase().includes(q) ||
      (r.clinicalIndication ?? "").toLowerCase().includes(q) ||
      (r.patient && `${r.patient.firstName} ${r.patient.lastName}`.toLowerCase().includes(q)) ||
      (r.provider && `dr ${r.provider.lastName}`.toLowerCase().includes(q))
    );
  }, [tab, query, incoming, active, completed, requests]);

  if (loading) return <LoadingState label="Loading test requests…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Laboratory test requests"
        description="Test requests raised by referring providers. Accept incoming requests to create a booking for this lab."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mb-4">
        <TabsList>
          <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by request number, test, patient or provider…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No requests"
          description={tab === "incoming" ? "No pending requests awaiting acceptance." : "No requests match this filter."}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{r.requestNumber}</span>
                      <StatusBadge status={r.priority} />
                      <StatusBadge status={r.status} />
                      {r.fastingRequired && (
                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-md px-2 py-0.5">Fasting</span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{r.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"}
                      {r.provider ? ` · Dr ${r.provider.lastName} (${r.provider.specialty})` : ""}
                      {r.sampleType ? ` · ${r.sampleType}` : ""}
                    </p>
                    {r.clinicalIndication && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        <span className="font-medium">Indication:</span> {r.clinicalIndication}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === "pending_booking" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => navigate("laboratory", "request", { id: r.id })}
                      >
                        Accept &amp; Book <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate("laboratory", "request", { id: r.id })}>
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
