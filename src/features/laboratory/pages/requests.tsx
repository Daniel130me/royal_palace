"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService } from "@/lib/services";
import type { LaboratoryRequest } from "@/types";
import { PageHeader, EmptyState, ErrorState, SkeletonGrid } from "@/components/healthcare/page-header";
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

  const incoming = useMemo(() => requests.filter((r) => r.status === "pending_booking"), [requests]);
  const active = useMemo(() => requests.filter((r) => ["booked", "sample_collected", "processing", "quality_review"].includes(r.status)), [requests]);
  const completed = useMemo(() => requests.filter((r) => ["completed", "cancelled"].includes(r.status)), [requests]);

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-9 bg-muted/40 animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Laboratory test requests"
        description="Test requests raised by referring providers. Accept incoming requests to create a booking for this lab."
      />

      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-background/95 backdrop-blur-md">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="flex-wrap h-auto overflow-x-auto">
            <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="relative">
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
            <Card key={r.id} className="overflow-hidden hover:shadow-soft-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-semibold text-sm">{r.requestNumber}</span>
                      <StatusBadge status={r.priority} size="sm" />
                      <StatusBadge status={r.status} size="sm" />
                      {r.fastingRequired && (
                        <span className="text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-1.5 py-0.5">Fasting</span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{r.tests.join(", ")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"}
                      {r.provider ? ` · Dr ${r.provider.lastName} (${r.provider.specialty})` : ""}
                      {r.sampleType ? ` · ${r.sampleType}` : ""}
                    </p>
                    {r.clinicalIndication && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        <span className="font-medium">Indication:</span> {r.clinicalIndication}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === "pending_booking" && (
                      <Button size="sm" onClick={() => navigate("laboratory", "request", { id: r.id })}>
                        Accept &amp; Book <ArrowRight className="h-3.5 w-3.5" />
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
