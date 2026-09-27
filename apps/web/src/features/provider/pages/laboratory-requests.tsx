"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { labRequestService } from "@/lib/services";
import { normalizeLabRequest, WithTimestamps } from "../normalize";
import type { LaboratoryRequest } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { Search, FlaskConical, ArrowRight, Clock } from "lucide-react";

type Tab = "pending" | "booked" | "completed" | "all";

export function ProviderLabRequests() {
  const { providerId } = useProviderContext();
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError((e as Error).message ?? "Failed to load lab requests.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...labRequests].sort((a, b) => ((b as WithTimestamps<LaboratoryRequest>).createdAt ?? "").localeCompare((a as WithTimestamps<LaboratoryRequest>).createdAt ?? "")),
    [labRequests]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((l) =>
      `${l.requestNumber} ${l.tests.join(" ")} ${l.patient ? fullName(l.patient) : ""}`.toLowerCase().includes(term)
    );
  }, [sorted, q]);

  const pending = filtered.filter((l) => l.status === "pending_booking");
  const booked = filtered.filter((l) => ["booked", "sample_collected", "processing", "quality_review"].includes(l.status));
  const completed = filtered.filter((l) => l.status === "completed");

  const current = tab === "all" ? filtered : tab === "pending" ? pending : tab === "booked" ? booked : completed;

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Laboratory requests" description="Tests you have ordered for your patients." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  function Row({ l }: { l: LaboratoryRequest }) {
    const hasResult = !!l.result;
    const isPending = l.status === "pending_booking";
    const toneBg = hasResult ? "bg-violet-50 text-violet-600" : isPending ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground";
    return (
      <CompactListItem
        leading={
          <div className={`rounded-xl p-2 ${toneBg}`}>
            <FlaskConical className="h-4 w-4" />
          </div>
        }
        title={l.requestNumber}
        subtitle={`${l.patient ? fullName(l.patient) : "Patient"} · ${l.tests.join(", ")} · ${formatDate((l as WithTimestamps<LaboratoryRequest>).createdAt)}`}
        onClick={hasResult
          ? () => navigate("provider", "results", { id: l.result!.id })
          : () => navigate("provider", "patient", { id: l.patientId })}
        trailing={
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <StatusBadge status={l.status} size="sm" />
              {isPending && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 h-5 text-[10px]">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> awaiting
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground capitalize">{l.priority}</span>
          </div>
        }
        chevron
      />
    );
  }

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

      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-2">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "pending", label: "Pending", badge: pending.length },
            { value: "booked", label: "In progress", badge: booked.length },
            { value: "completed", label: "Completed", badge: completed.length },
            { value: "all", label: "All", badge: filtered.length },
          ]}
        />
      </div>

      {current.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={
            tab === "pending" ? "No pending requests" :
            tab === "booked" ? "No tests in progress" :
            tab === "completed" ? "No completed tests" :
            "No lab requests"
          }
          description={
            tab === "pending" ? "All your tests have been booked." :
            tab === "booked" ? "Booked tests will appear here while being processed." :
            tab === "completed" ? "Completed tests with results will appear here." :
            "Order lab tests from within an encounter."
          }
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {current.map((l) => <Row key={l.id} l={l} />)}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{current.length} request(s)</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          New from encounter <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
