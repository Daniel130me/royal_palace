"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService } from "@/lib/services";
import type { LaboratoryRequest } from "@/types";
import { PageHeader, EmptyState, ErrorState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
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
    <div className="space-y-4">
      <PageHeader
        title="Test requests"
        description="Accept incoming requests to create a booking."
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by request, test, patient or provider…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <SegmentedControl
        options={[
          { value: "incoming" as TabKey, label: "Incoming", badge: incoming.length },
          { value: "active" as TabKey, label: "Active", badge: active.length },
          { value: "completed" as TabKey, label: "Completed", badge: completed.length },
          { value: "all" as TabKey, label: "All", badge: requests.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No requests"
          description={tab === "incoming" ? "No pending requests awaiting acceptance." : "No requests match this filter."}
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((r) => (
            <CompactListItem
              key={r.id}
              leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><FlaskConical className="h-4 w-4 text-sky-600" /></div>}
              title={`${r.requestNumber} · ${r.tests.join(", ")}`}
              subtitle={`${r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Patient"}${r.provider ? ` · Dr ${r.provider.lastName}` : ""}${r.sampleType ? ` · ${r.sampleType}` : ""}`}
              trailing={
                <div className="flex items-center gap-1.5">
                  {r.fastingRequired && (
                    <span className="text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-1.5 py-0.5">Fast</span>
                  )}
                  <StatusBadge status={r.priority} size="sm" />
                  <StatusBadge status={r.status} size="sm" />
                </div>
              }
              onClick={() => navigate("laboratory", "request", { id: r.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
